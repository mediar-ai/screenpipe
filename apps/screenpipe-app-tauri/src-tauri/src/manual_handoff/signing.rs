// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

use super::super::Identity;
use anyhow::{bail, Context, Result};
use core_foundation::{
    array::CFArray,
    base::{CFType, CFTypeRef, TCFType},
    data::CFData,
    dictionary::{CFDictionary, CFDictionaryRef},
    string::{CFString, CFStringRef},
    url::CFURL,
};
use security_framework::os::macos::code_signing::{
    Flags, GuestAttributes, SecCode, SecRequirement, SecStaticCode,
};
use std::{
    mem::size_of,
    path::{Path, PathBuf},
    sync::OnceLock,
};

static SIGNER: OnceLock<(String, Vec<u8>)> = OnceLock::new();

#[link(name = "Security", kind = "framework")]
extern "C" {
    fn SecCodeCopySigningInformation(
        code: CFTypeRef,
        flags: u32,
        info: *mut CFDictionaryRef,
    ) -> i32;
    fn SecCodeCopyDesignatedRequirement(
        code: CFTypeRef,
        flags: u32,
        requirement: *mut CFTypeRef,
    ) -> i32;
    fn SecRequirementCopyString(requirement: CFTypeRef, flags: u32, text: *mut CFStringRef) -> i32;
    static kSecCodeInfoIdentifier: CFStringRef;
    static kSecCodeInfoUnique: CFStringRef;
    static kSecCodeInfoPList: CFStringRef;
    static kSecCodeInfoCertificates: CFStringRef;
    fn SecCertificateCopyData(cert: CFTypeRef) -> core_foundation::data::CFDataRef;
}
extern "C" {
    fn csops(pid: i32, operation: u32, address: *mut libc::c_void, size: usize) -> i32;
}

pub(super) fn check(status: i32) -> Result<()> {
    if status != 0 {
        bail!("code signature status {status}");
    }
    Ok(())
}

fn information(code: CFTypeRef) -> Result<(String, String, String)> {
    unsafe {
        let mut raw = std::ptr::null();
        check(SecCodeCopySigningInformation(code, 1 << 1, &mut raw))?;
        let info = CFDictionary::<CFString, CFType>::wrap_under_create_rule(raw);
        let identifier = info
            .find(&CFString::wrap_under_get_rule(kSecCodeInfoIdentifier))
            .and_then(|v| v.downcast::<CFString>())
            .context("signature has no identifier")?
            .to_string();
        let hash = info
            .find(&CFString::wrap_under_get_rule(kSecCodeInfoUnique))
            .and_then(|v| v.downcast::<CFData>())
            .context("signature has no code hash")?;
        let plist = info
            .find(&CFString::wrap_under_get_rule(kSecCodeInfoPList))
            .and_then(|v| v.downcast::<CFDictionary>())
            .context("signature has no secured bundle metadata")?;
        let plist =
            CFDictionary::<CFString, CFType>::wrap_under_get_rule(plist.as_concrete_TypeRef());
        let version = plist
            .find(&CFString::new("CFBundleShortVersionString"))
            .and_then(|v| v.downcast::<CFString>())
            .context("bundle has no version")?
            .to_string();
        Ok((identifier, hex(hash.bytes()), version))
    }
}

pub(super) fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

pub(crate) fn process_stamp(pid: i32) -> Result<(u32, u64)> {
    let mut info: libc::proc_bsdinfo = unsafe { std::mem::zeroed() };
    let len = unsafe {
        libc::proc_pidinfo(
            pid,
            libc::PROC_PIDTBSDINFO,
            0,
            (&mut info as *mut libc::proc_bsdinfo).cast(),
            size_of::<libc::proc_bsdinfo>() as i32,
        )
    };
    if len != size_of::<libc::proc_bsdinfo>() as i32 {
        bail!("process {pid} is unavailable");
    }
    Ok((
        info.pbi_uid,
        info.pbi_start_tvsec * 1_000_000 + info.pbi_start_tvusec,
    ))
}

pub(super) fn process_hash(pid: i32) -> Result<String> {
    let mut hash = [0u8; 20];
    if unsafe {
        csops(
            pid,
            5, /* CS_OPS_CDHASH */
            hash.as_mut_ptr().cast(),
            hash.len(),
        )
    } != 0
    {
        return Err(std::io::Error::last_os_error()).context("read running code hash");
    }
    Ok(hex(&hash))
}

pub(super) fn is_same_process(identity: &Identity) -> bool {
    process_stamp(identity.pid).ok() == Some((identity.uid, identity.started))
        && process_hash(identity.pid).ok().as_deref() == Some(&identity.hash)
}

fn guest(pid: i32) -> Result<SecCode> {
    let mut attrs = GuestAttributes::new();
    attrs.set_pid(pid);
    Ok(SecCode::copy_guest_with_attribues(
        None,
        &attrs,
        Flags::NONE,
    )?)
}

pub(super) fn claimed_identifier(pid: i32) -> Option<String> {
    // Unverified metadata can only make a failed authentication visible. It
    // never authorizes termination or establishes the running build identity.
    let code = guest(pid).ok()?;
    unsafe {
        let mut raw = std::ptr::null();
        check(SecCodeCopySigningInformation(
            code.as_CFTypeRef(),
            0,
            &mut raw,
        ))
        .ok()?;
        let info = CFDictionary::<CFString, CFType>::wrap_under_create_rule(raw);
        info.find(&CFString::wrap_under_get_rule(kSecCodeInfoIdentifier))
            .and_then(|v| v.downcast::<CFString>())
            .map(|v| v.to_string())
    }
}

pub(super) fn verify_process(pid: i32, requirement: &str) -> Result<()> {
    let requirement: SecRequirement = requirement.parse()?;
    if guest(pid)?
        .check_validity(Flags::NONE, &requirement)
        .is_ok()
    {
        return Ok(());
    }
    verify_replaced_process(pid)
}

fn verify_replaced_process(pid: i32) -> Result<()> {
    let (identifier, certificate) = SIGNER
        .get()
        .context("verified app signing certificate unavailable")?;
    super::kernel_signature::verify(pid, identifier, certificate)
        .context("authenticate original running signature after bundle replacement")
}

pub(super) fn own_requirement() -> Result<String> {
    let code = SecCode::for_self(Flags::NONE)?;
    unsafe {
        let mut raw = std::ptr::null();
        check(SecCodeCopyDesignatedRequirement(
            code.as_CFTypeRef(),
            0,
            &mut raw,
        ))?;
        let requirement = CFType::wrap_under_create_rule(raw);
        let mut text = std::ptr::null();
        check(SecRequirementCopyString(
            requirement.as_CFTypeRef(),
            0,
            &mut text,
        ))?;
        let requirement = CFString::wrap_under_create_rule(text).to_string();
        // Cache the actual signing certificate before this process's bundle can
        // be replaced. Kernel-only recovery additionally requires this exact
        // certificate and signed identifier, never an untrusted display name.
        let parsed: SecRequirement = requirement.parse()?;
        code.check_validity(Flags::NONE, &parsed)?;
        let mut raw_info = std::ptr::null();
        check(SecCodeCopySigningInformation(
            code.as_CFTypeRef(),
            1 << 1,
            &mut raw_info,
        ))?;
        let info = CFDictionary::<CFString, CFType>::wrap_under_create_rule(raw_info);
        if let (Some(identifier), Some(certificates)) = (
            info.find(&CFString::wrap_under_get_rule(kSecCodeInfoIdentifier))
                .and_then(|v| v.downcast::<CFString>()),
            info.find(&CFString::wrap_under_get_rule(kSecCodeInfoCertificates))
                .and_then(|v| v.downcast::<CFArray>()),
        ) {
            let certificates =
                CFArray::<CFType>::wrap_under_get_rule(certificates.as_concrete_TypeRef());
            if let Some(cert) = certificates.get(0) {
                let bytes =
                    CFData::wrap_under_create_rule(SecCertificateCopyData(cert.as_CFTypeRef()));
                let _ = SIGNER.set((identifier.to_string(), bytes.bytes().to_vec()));
            }
        }
        Ok(requirement)
    }
}

pub(super) fn running(pid: i32, requirement: &str) -> Result<Identity> {
    let (uid, started) = process_stamp(pid)?;
    let code = guest(pid)?;
    let requirement: SecRequirement = requirement.parse()?;
    let metadata = code
        .check_validity(Flags::NONE, &requirement)
        .map_err(anyhow::Error::from)
        .and_then(|()| information(code.as_CFTypeRef()));
    let hash = process_hash(pid)?;
    let (identifier, version) = match metadata {
        Ok((identifier, signed_hash, version)) if hash == signed_hash => (identifier, version),
        _ => {
            verify_replaced_process(pid)?;
            let identifier = SIGNER.get().context("missing verified signer")?.0.clone();
            let version = registered_process_version(pid, &identifier)?;
            (identifier, version)
        }
    };
    if process_stamp(pid)? != (uid, started) || process_hash(pid)? != hash {
        bail!("process changed while reading its identity");
    }
    let executable = process_path(pid)?;
    Ok(Identity {
        pid,
        started,
        uid,
        identifier,
        version,
        hash,
        executable,
    })
}

fn registered_process_version(pid: i32, identifier: &str) -> Result<String> {
    // Launch Services retains metadata registered by this PID at launch, even
    // after its bundle is replaced/re-registered. Reading that process record
    // avoids assigning the replacement Info.plist's version to the old process.
    let mut child = std::process::Command::new("/usr/bin/lsappinfo")
        .args([
            "info",
            "-only",
            "CFBundleShortVersionString,CFBundleIdentifier",
            &pid.to_string(),
        ])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()?;
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(3);
    while child.try_wait()?.is_none() {
        if std::time::Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            bail!("timed out reading original process version");
        }
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
    let output = child.wait_with_output()?;
    if !output.status.success() {
        bail!("original process version unavailable");
    }
    parse_registered_version(std::str::from_utf8(&output.stdout)?, identifier)
}

fn parse_registered_version(output: &str, identifier: &str) -> Result<String> {
    let mut fields = std::collections::HashMap::new();
    for line in output.lines() {
        if let Some((key, value)) = line.trim().split_once('=') {
            fields.insert(
                serde_json::from_str::<String>(key)?,
                serde_json::from_str::<String>(value)?,
            );
        }
    }
    if fields.get("CFBundleIdentifier").map(String::as_str) != Some(identifier) {
        bail!("original process registration has a different app identity");
    }
    let version = fields
        .remove("CFBundleShortVersionString")
        .context("original process registration has no version")?;
    semver::Version::parse(&version)
        .context("original process registration has an invalid version")?;
    Ok(version)
}

pub(super) fn on_disk(executable: &Path, requirement: &str, owner: &Identity) -> Result<Identity> {
    let macos = executable.parent().context("missing executable parent")?;
    let contents = macos.parent().context("missing bundle Contents")?;
    if macos.file_name() != Some(std::ffi::OsStr::new("MacOS"))
        || contents.file_name() != Some(std::ffi::OsStr::new("Contents"))
    {
        bail!("replacement is not a bundle executable");
    }
    let bundle = contents.parent().context("missing application bundle")?;
    let url = CFURL::from_path(bundle, true).context("invalid executable path")?;
    let code = SecStaticCode::from_path(&url, Flags::NONE)?;
    let requirement: SecRequirement = requirement.parse()?;
    code.check_validity(
        Flags::STRICT_VALIDATE | Flags::CHECK_NESTED_CODE,
        &requirement,
    )?;
    let (identifier, hash, version) = information(code.as_CFTypeRef())?;
    Ok(Identity {
        identifier,
        version,
        hash,
        executable: executable.to_path_buf(),
        ..owner.clone()
    })
}

pub(super) fn process_path(pid: i32) -> Result<PathBuf> {
    let mut buf = [0u8; libc::PROC_PIDPATHINFO_MAXSIZE as usize];
    let len = unsafe { libc::proc_pidpath(pid, buf.as_mut_ptr().cast(), buf.len() as u32) };
    if len <= 0 {
        bail!("process executable is unavailable");
    }
    use std::os::unix::ffi::OsStrExt;
    let end = buf.iter().position(|b| *b == 0).unwrap_or(buf.len());
    Ok(PathBuf::from(std::ffi::OsStr::from_bytes(&buf[..end])))
}

pub(super) fn candidates(executable_name: &std::ffi::OsStr) -> Result<Vec<i32>> {
    let mut pids = vec![0i32; 8192];
    let bytes = unsafe {
        libc::proc_listpids(
            4, /* PROC_UID_ONLY, sys/proc_info.h */
            libc::geteuid(),
            pids.as_mut_ptr().cast(),
            (pids.len() * size_of::<i32>()) as i32,
        )
    };
    if bytes <= 0 || bytes as usize >= pids.len() * size_of::<i32>() {
        bail!("could not enumerate app processes");
    }
    pids.truncate(bytes as usize / size_of::<i32>());
    Ok(pids
        .into_iter()
        .filter(|pid| *pid > 0 && *pid != std::process::id() as i32)
        .filter(|pid| {
            process_path(*pid)
                .ok()
                .and_then(|p| p.file_name().map(|n| n == executable_name))
                .unwrap_or(false)
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn original_version_requires_matching_process_registration() {
        let output =
            "\"CFBundleShortVersionString\"=\"2.7.94\"\n\"CFBundleIdentifier\"=\"screenpi.pe\"\n";
        assert_eq!(
            parse_registered_version(output, "screenpi.pe").unwrap(),
            "2.7.94"
        );
        assert!(parse_registered_version(output, "screenpi.pe.beta").is_err());
        assert!(
            parse_registered_version(&output.replace("2.7.94", "unknown"), "screenpi.pe").is_err()
        );
        assert!(parse_registered_version("", "screenpi.pe").is_err());
    }

    #[test]
    fn kernel_process_satisfies_its_designated_requirement() {
        let requirement = own_requirement().unwrap();
        verify_process(std::process::id() as i32, &requirement).unwrap();
        assert!(!process_hash(std::process::id() as i32).unwrap().is_empty());
    }
}
