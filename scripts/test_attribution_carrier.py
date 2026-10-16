# screenpipe — AI that knows everything you've seen, said, or heard
# https://screenpipe.com
"""Local macOS packaging regression. Uses a synthetic ad-hoc signed app only."""
import importlib.util
import hashlib
import json
import sys
from pathlib import Path
import plistlib
import shutil
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('carrier', Path(__file__).with_name('package-attribution-carrier.py'))
carrier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(carrier)


class CarrierTest(unittest.TestCase):
    @unittest.skipUnless(sys.platform == "darwin", "requires macOS signing tools")
    def test_signed_archive_metadata_and_overwrite_boundaries(self):
        with tempfile.TemporaryDirectory(prefix='screenpipe-carrier-test-') as tmp:
            root = Path(tmp)
            app = root / 'Fixture.app'
            executable = app / 'Contents/MacOS/Fixture'
            executable.parent.mkdir(parents=True)
            shutil.copyfile('/bin/echo', executable)
            executable.chmod(0o755)
            (app / 'Contents/Info.plist').write_bytes(plistlib.dumps(dict(
                CFBundleIdentifier='com.screenpipe.carrier-fixture', CFBundleExecutable='Fixture',
                CFBundleName='Fixture', CFBundlePackageType='APPL', CFBundleShortVersionString='0.3.100')))
            subprocess.run(['codesign', '--force', '--sign', '-', str(app)], check=True)
            architectures = subprocess.check_output(['lipo', '-archs', str(executable)]).decode()
            platform = 'macos-arm' if 'arm64' in architectures else 'macos-intel'
            output = root / 'output'
            archive, manifest = carrier.package(app, output, platform, '0.3.100')
            self.assertTrue(archive.is_file())
            self.assertTrue(manifest.is_file())
            # Packaging already verifies extraction, xattr preservation and the
            # actual extracted signature. Also prove it never mutates the input.
            attrs = subprocess.check_output(['xattr', str(app)]).decode()
            self.assertNotIn('com.apple.application-instance', attrs)
            with self.assertRaisesRegex(ValueError, 'overwrite'):
                carrier.package(app, output, platform, '0.3.100')
            with self.assertRaisesRegex(ValueError, 'version'):
                carrier.package(app, root / 'wrong-version', platform, '0.3.101')

    def test_appimage_bytes_unchanged_and_metadata_bounded(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            artifact = root / 'screenpipe_1.2.3_amd64.AppImage'
            content = bytearray(1024)
            content[:6] = b'\x7fELF\x02\x01'
            content[8:11] = b'AI\x02'
            content[18] = 62
            artifact.write_bytes(content)
            artifact.chmod(0o755)
            prepared, manifest = carrier.package_filename(artifact, root / 'out', 'linux', '1.2.3')
            self.assertEqual(prepared.read_bytes(), content)
            self.assertEqual(artifact.read_bytes(), content)
            data = json.loads(manifest.read_text())
            self.assertEqual(data['sha256'], hashlib.sha256(content).hexdigest())
            self.assertEqual(data['carrier'], 'filename')
            with self.assertRaisesRegex(ValueError, 'overwrite'):
                carrier.package_filename(artifact, root / 'out', 'linux', '1.2.3')
            with self.assertRaisesRegex(ValueError, 'version'):
                carrier.package_filename(artifact, root / 'bad-version', 'linux', '1.2.4')
            content[18] = 183
            artifact.write_bytes(content)
            with self.assertRaisesRegex(ValueError, 'x86_64'):
                carrier.package_filename(artifact, root / 'bad-arch', 'linux', '1.2.3')


if __name__ == '__main__':
    unittest.main()
