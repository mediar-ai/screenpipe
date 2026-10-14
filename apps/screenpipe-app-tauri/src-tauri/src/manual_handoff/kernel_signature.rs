// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

//! Authenticate a process whose original bundle is no longer on disk. Never
//! treat replacement files as evidence about the executable already mapped by
//! the kernel. The CMS signature is checked by Security.framework, not by us.

use anyhow::{bail, Context, Result};
use core_foundation::{
    base::{CFType, CFTypeRef, TCFType},
    data::CFData,
};
use sha2::Digest;

#[link(name = "Security", kind = "framework")]
extern "C" {
    fn CMSDecoderCreate(decoder: *mut CFTypeRef) -> i32;
    fn CMSDecoderSetDetachedContent(decoder: CFTypeRef, data: CFTypeRef) -> i32;
    fn CMSDecoderUpdateMessage(decoder: CFTypeRef, data: *const u8, len: usize) -> i32;
    fn CMSDecoderFinalizeMessage(decoder: CFTypeRef) -> i32;
    fn CMSDecoderCopySignerStatus(
        decoder: CFTypeRef,
        index: usize,
        policy: CFTypeRef,
        evaluate_trust: u8,
        status: *mut u32,
        trust: *mut CFTypeRef,
        result: *mut i32,
    ) -> i32;
    fn CMSDecoderCopySignerCert(decoder: CFTypeRef, index: usize, cert: *mut CFTypeRef) -> i32;
    fn SecCertificateCopyData(cert: CFTypeRef) -> core_foundation::data::CFDataRef;
    fn SecPolicyCreateWithProperties(policy: CFTypeRef, properties: CFTypeRef) -> CFTypeRef;
    static kSecPolicyAppleCodeSigning: CFTypeRef;
}
extern "C" {
    fn csops(pid: i32, op: u32, data: *mut libc::c_void, len: usize) -> i32;
}

fn word(data: &[u8], offset: usize) -> Result<usize> {
    Ok(u32::from_be_bytes(
        data.get(offset..offset + 4)
            .context("truncated kernel signature")?
            .try_into()?,
    ) as usize)
}

fn component(data: &[u8], slot: usize, magic: usize) -> Result<&[u8]> {
    if word(data, 0)? != 0xfade0cc0 || word(data, 4)? != data.len() {
        bail!("invalid kernel signature container");
    }
    let count = word(data, 8)?;
    if count > data.len().saturating_sub(12) / 8 {
        bail!("invalid signature index");
    }
    let mut found = None;
    for index in 0..count {
        if word(data, 12 + index * 8)? == slot {
            if found.is_some() {
                bail!("duplicate signature component");
            }
            let offset = word(data, 16 + index * 8)?;
            let len = word(data, offset + 4)?;
            if offset < 12 + count * 8 || len < 8 || word(data, offset)? != magic {
                bail!("invalid signature component");
            }
            found = Some(
                data.get(offset..offset.checked_add(len).context("signature overflow")?)
                    .context("truncated signature component")?,
            );
        }
    }
    found.context("missing kernel signature component")
}

fn directory_identity(directory: &[u8], expected_hash: &str) -> Result<String> {
    let algorithm = *directory.get(37).context("truncated code directory")?;
    let digest = match algorithm {
        1 => sha1::Sha1::digest(directory).to_vec(),
        2 | 3 => sha2::Sha256::digest(directory).to_vec(),
        _ => bail!("unsupported running code digest {algorithm}"),
    };
    // Do not accept an alternative directory merely because it is present in
    // the blob. Only the primary directory verified by CMS is used here.
    if super::signing::hex(&digest[..20]) != expected_hash {
        bail!("CMS-signed directory does not match the running kernel code hash");
    }
    let offset = word(directory, 20)?;
    let tail = directory
        .get(offset..)
        .context("invalid signed identifier offset")?;
    let end = tail
        .iter()
        .position(|v| *v == 0)
        .context("unterminated signed identifier")?;
    Ok(std::str::from_utf8(&tail[..end])?.to_owned())
}

pub(super) fn verify(pid: i32, expected_identifier: &str, expected_cert: &[u8]) -> Result<()> {
    let call =
        |op, buffer: &mut [u8]| unsafe { csops(pid, op, buffer.as_mut_ptr().cast(), buffer.len()) };
    let mut status = [0; 4];
    if call(0, &mut status) != 0 || u32::from_ne_bytes(status) & 1 == 0 {
        bail!("running code is no longer valid");
    }
    let mut hash = [0; 20];
    if call(5, &mut hash) != 0 {
        bail!("cannot read authenticated kernel code hash");
    }
    let mut header = [0; 8];
    if call(10, &mut header) != -1
        || std::io::Error::last_os_error().raw_os_error() != Some(libc::ERANGE)
    {
        bail!("cannot read authenticated kernel signature size");
    }
    let len = word(&header, 4)?;
    if !(12..=1024 * 1024).contains(&len) {
        bail!("invalid kernel signature size");
    }
    let mut blob = vec![0; len];
    if call(10, &mut blob) != 0 {
        bail!("cannot read authenticated kernel signature");
    }
    verify_blob(
        &blob,
        &super::signing::hex(&hash),
        expected_identifier,
        expected_cert,
    )
}

fn verify_blob(blob: &[u8], hash: &str, identifier: &str, certificate: &[u8]) -> Result<()> {
    // CS_OPS_BLOB reports the allocated signature region, which can include
    // linker padding after the embedded SuperBlob. Parse only its declared
    // length; component offsets must still remain inside that signed container.
    let blob = signature_container(blob)?;
    let directory = component(blob, 0, 0xfade0c02)?;
    let cms = &component(blob, 0x10000, 0xfade0b01)?[8..];
    if directory_identity(directory, hash)? != identifier {
        bail!("different signed app edition");
    }
    unsafe {
        let mut raw = std::ptr::null();
        super::signing::check(CMSDecoderCreate(&mut raw))?;
        let decoder = CFType::wrap_under_create_rule(raw);
        let content = CFData::from_buffer(directory);
        super::signing::check(CMSDecoderSetDetachedContent(
            decoder.as_CFTypeRef(),
            content.as_CFTypeRef(),
        ))?;
        super::signing::check(CMSDecoderUpdateMessage(
            decoder.as_CFTypeRef(),
            cms.as_ptr(),
            cms.len(),
        ))?;
        super::signing::check(CMSDecoderFinalizeMessage(decoder.as_CFTypeRef()))?;
        let policy = SecPolicyCreateWithProperties(kSecPolicyAppleCodeSigning, std::ptr::null());
        if policy.is_null() {
            bail!("code signing trust policy unavailable");
        }
        let policy = CFType::wrap_under_create_rule(policy);
        let mut status = 0;
        let mut trust_result = 0;
        super::signing::check(CMSDecoderCopySignerStatus(
            decoder.as_CFTypeRef(),
            0,
            policy.as_CFTypeRef(),
            1,
            &mut status,
            std::ptr::null_mut(),
            &mut trust_result,
        ))?;
        if status != 1 || trust_result != 0 {
            bail!("running CMS signature or signing trust failed: status={status}, trust={trust_result}");
        }
        let mut cert = std::ptr::null();
        super::signing::check(CMSDecoderCopySignerCert(
            decoder.as_CFTypeRef(),
            0,
            &mut cert,
        ))?;
        let cert = CFType::wrap_under_create_rule(cert);
        let data = CFData::wrap_under_create_rule(SecCertificateCopyData(cert.as_CFTypeRef()));
        if data.bytes() != certificate {
            bail!("running process has a different signing certificate");
        }
    }
    Ok(())
}

fn signature_container(blob: &[u8]) -> Result<&[u8]> {
    let len = word(blob, 4)?;
    if len < 12 || word(blob, 0)? != 0xfade0cc0 {
        bail!("invalid kernel signature container");
    }
    blob.get(..len)
        .context("truncated kernel signature container")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "requires a signed process fixture captured inside a disposable macOS guest"]
    fn replaced_process_cms_still_authenticates_and_rejects_tampering() {
        let root =
            std::path::PathBuf::from(std::env::var_os("HANDOFF_TEST_SIGNATURE_DIR").unwrap());
        let blob = std::fs::read(root.join("signature.bin")).unwrap();
        let cert = std::fs::read(root.join("certificate.der")).unwrap();
        let hash = std::fs::read_to_string(root.join("hash.txt")).unwrap();
        verify_blob(&blob, hash.trim(), "screenpi.pe", &cert).unwrap();
        assert!(verify_blob(&blob, hash.trim(), "screenpi.pe.beta", &cert).is_err());
        assert!(verify_blob(&blob, hash.trim(), "screenpi.pe", b"different signer").is_err());
        let mut tampered = blob.clone();
        let directory = component(signature_container(&blob).unwrap(), 0, 0xfade0c02).unwrap();
        let offset = directory.as_ptr() as usize - blob.as_ptr() as usize;
        tampered[offset + 44] ^= 1;
        assert!(verify_blob(&tampered, hash.trim(), "screenpi.pe", &cert).is_err());
        let mut tampered = blob.clone();
        let cms = component(signature_container(&blob).unwrap(), 0x10000, 0xfade0b01).unwrap();
        let offset = cms.as_ptr() as usize - blob.as_ptr() as usize;
        tampered[offset + 8] ^= 1;
        assert!(verify_blob(&tampered, hash.trim(), "screenpi.pe", &cert).is_err());
    }
    #[test]
    fn malformed_kernel_signatures_fail_closed() {
        for bytes in [vec![], vec![0; 8], vec![255; 128]] {
            assert!(verify_blob(&bytes, "hash", "screenpi.pe", b"cert").is_err());
        }
    }
    #[test]
    fn kernel_allocation_padding_is_outside_the_signature_container() {
        let mut blob = Vec::new();
        blob.extend_from_slice(&0xfade0cc0u32.to_be_bytes());
        blob.extend_from_slice(&12u32.to_be_bytes());
        blob.extend_from_slice(&0u32.to_be_bytes());
        blob.resize(4096, 0);
        assert_eq!(signature_container(&blob).unwrap().len(), 12);
        blob[4..8].copy_from_slice(&4097u32.to_be_bytes());
        assert!(signature_container(&blob).is_err());
    }
    #[test]
    fn directory_hash_binds_the_running_identifier() {
        let mut directory = vec![0; 44];
        directory[20..24].copy_from_slice(&44u32.to_be_bytes());
        directory[37] = 2;
        directory.extend_from_slice(b"screenpi.pe\0");
        let hash = super::super::signing::hex(&sha2::Sha256::digest(&directory)[..20]);
        assert_eq!(
            directory_identity(&directory, &hash).unwrap(),
            "screenpi.pe"
        );
        directory[44] = b'x';
        assert!(directory_identity(&directory, &hash).is_err());
    }
}
