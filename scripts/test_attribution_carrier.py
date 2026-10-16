# screenpipe — AI that knows everything you've seen, said, or heard
# https://screenpipe.com
"""Local macOS packaging regression. Uses a synthetic ad-hoc signed app only."""
import importlib.util
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


if __name__ == '__main__':
    unittest.main()
