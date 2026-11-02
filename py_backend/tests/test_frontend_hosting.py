import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from starlette.exceptions import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class FrontendHostingTest(unittest.TestCase):
    def test_admin_route_serves_built_frontend_and_api_paths_stay_api(self):
        with patch('app.db.init_db'):
            from app.main import frontend_app
        response = frontend_app('admin')
        self.assertTrue(str(response.path).endswith('frontend/build/index.html'))
        build_root = Path(__file__).resolve().parents[2] / 'frontend' / 'build'
        asset_path = next((build_root / 'static' / 'js').glob('main.*.js'))
        static = frontend_app(str(asset_path.relative_to(build_root)))
        self.assertEqual(Path(static.path), asset_path.resolve())
        with self.assertRaises(HTTPException) as error:
            frontend_app('api/missing')
        self.assertEqual(error.exception.status_code, 404)

    def test_media_path_cannot_escape_storage_root(self):
        from app.routes.media import _resolve_local_file
        with self.assertRaises(HTTPException) as error:
            _resolve_local_file('attachments/user/../../../outside/file.txt')
        self.assertEqual(error.exception.status_code, 403)


if __name__ == '__main__':
    unittest.main()
