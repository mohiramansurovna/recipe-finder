#!/usr/bin/env python3
"""Download and verify the pinned Food.com dataset."""

import csv
import sys
from pathlib import Path
from typing import Protocol

PROJECT_ROOT = Path(__file__).resolve().parents[1]
RAW_DATA_DIR = PROJECT_ROOT / "data" / "raw"
DATASET_HANDLE = "shuyangli94/food-com-recipes-and-user-interactions/versions/2"
REQUIRED_COLUMNS = {"name", "id", "minutes", "tags", "ingredients"}


class DatasetDownloader(Protocol):
    def __call__(self, dataset_handle: str, *, output_dir: str) -> str: ...


def download_dataset(
    output_dir: Path = RAW_DATA_DIR,
    *,
    downloader: DatasetDownloader | None = None,
) -> Path:
    if downloader is None:
        try:
            import kagglehub
        except ImportError as exc:
            raise RuntimeError(
                "KaggleHub could not be imported "
                f"({exc}). Install project Python dependencies before downloading."
            ) from exc
        downloader = kagglehub.dataset_download

    output_dir.mkdir(parents=True, exist_ok=True)
    try:
        downloader(DATASET_HANDLE, output_dir=str(output_dir))
    except Exception as exc:
        raise RuntimeError(
            "KaggleHub could not download dataset version 2. Check KaggleHub "
            "authentication and access to the dataset; credentials must remain "
            "outside the repository."
        ) from exc

    recipes_path = output_dir / "RAW_recipes.csv"
    if not recipes_path.is_file():
        present_files = sorted(path.name for path in output_dir.iterdir() if path.is_file())
        raise RuntimeError(
            "Dataset version 2 did not provide RAW_recipes.csv in "
            f"{output_dir}. Files found: {', '.join(present_files) or '(none)'}."
        )

    with recipes_path.open(newline="", encoding="utf-8-sig") as source:
        reader = csv.reader(source)
        columns = next(reader, [])
    missing_columns = sorted(REQUIRED_COLUMNS.difference(columns))
    if missing_columns:
        raise RuntimeError(
            "RAW_recipes.csv is incompatible with Recipe Graph; missing required "
            f"columns: {', '.join(missing_columns)}."
        )

    return recipes_path


def main() -> int:
    try:
        recipes_path = download_dataset()
    except (OSError, RuntimeError, StopIteration) as exc:
        print(f"Dataset download failed: {exc}", file=sys.stderr)
        return 1

    print(f"Verified recipe source: {recipes_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
