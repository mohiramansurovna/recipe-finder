import csv
import tempfile
import unittest
from pathlib import Path

from scripts.download_dataset import DATASET_HANDLE, REQUIRED_COLUMNS, download_dataset


class DownloadDatasetTests(unittest.TestCase):
    def test_downloads_pinned_version_into_requested_directory(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            output_dir = Path(temporary_directory) / "raw"
            calls: list[tuple[str, str]] = []

            def downloader(dataset_handle: str, *, output_dir: str) -> str:
                calls.append((dataset_handle, output_dir))
                recipes_path = Path(output_dir) / "RAW_recipes.csv"
                recipes_path.parent.mkdir(parents=True, exist_ok=True)
                with recipes_path.open("w", newline="", encoding="utf-8") as recipes:
                    csv.writer(recipes).writerow(sorted(REQUIRED_COLUMNS))
                return str(Path(output_dir))

            result = download_dataset(output_dir, downloader=downloader)

            self.assertEqual(calls, [(DATASET_HANDLE, str(output_dir))])
            self.assertEqual(result, output_dir / "RAW_recipes.csv")

    def test_reports_authentication_or_access_failure_actionably(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            def downloader(dataset_handle: str, *, output_dir: str) -> str:
                raise OSError("request denied")

            with self.assertRaisesRegex(RuntimeError, "Check KaggleHub authentication"):
                download_dataset(Path(temporary_directory) / "raw", downloader=downloader)

    def test_rejects_archive_without_required_recipe_columns(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            output_dir = Path(temporary_directory) / "raw"

            def downloader(dataset_handle: str, *, output_dir: str) -> str:
                recipes_path = Path(output_dir) / "RAW_recipes.csv"
                recipes_path.parent.mkdir(parents=True, exist_ok=True)
                recipes_path.write_text("name,id\nSoup,1\n", encoding="utf-8")
                return str(Path(output_dir))

            with self.assertRaisesRegex(RuntimeError, "missing required columns"):
                download_dataset(output_dir, downloader=downloader)

    def test_rejects_archive_without_raw_recipes_file(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            output_dir = Path(temporary_directory) / "raw"

            def downloader(dataset_handle: str, *, output_dir: str) -> str:
                Path(output_dir).mkdir(parents=True, exist_ok=True)
                (Path(output_dir) / "PP_recipes.csv").write_text("id\n", encoding="utf-8")
                return str(Path(output_dir))

            with self.assertRaisesRegex(RuntimeError, "did not provide RAW_recipes.csv"):
                download_dataset(output_dir, downloader=downloader)


if __name__ == "__main__":
    unittest.main()
