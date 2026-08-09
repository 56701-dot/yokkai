from __future__ import annotations

import argparse
import json
from pathlib import Path


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pose-biomech",
        description="Biomechanics-first exercise recognition from BlazePose landmarks",
    )
    commands = parser.add_subparsers(dest="command", required=True)

    extract = commands.add_parser("extract", help="Extract BlazePose landmarks from a video")
    extract.add_argument("video")
    extract.add_argument("output")
    extract.add_argument("--model-complexity", type=int, default=2, choices=(0, 1, 2))

    train = commands.add_parser("train", help="Train a multi-task sequence model")
    train.add_argument("--config", default="configs/base.yaml")

    evaluate = commands.add_parser("evaluate", help="Evaluate a checkpoint")
    evaluate.add_argument("checkpoint")
    evaluate.add_argument("--manifest")
    evaluate.add_argument("--split", default="test")

    serve = commands.add_parser("serve", help="Serve stateless real-time window inference")
    serve.add_argument("checkpoint")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8000)
    serve.add_argument("--device")
    return parser


def main() -> None:
    args = build_parser().parse_args()
    if args.command == "extract":
        from .extraction import extract_video

        result = extract_video(
            args.video,
            args.output,
            model_complexity=args.model_complexity,
        )
        print(json.dumps(result.__dict__, default=str, indent=2))
    elif args.command == "train":
        from .training import train

        checkpoint = train(Path(args.config))
        print(checkpoint)
    elif args.command == "evaluate":
        from .training import evaluate_checkpoint

        result = evaluate_checkpoint(args.checkpoint, args.manifest, args.split)
        print(json.dumps(result, indent=2, ensure_ascii=False))
    elif args.command == "serve":
        try:
            import uvicorn
        except ImportError as exc:
            raise RuntimeError("Install with: pip install -e '.[serve]'") from exc
        from .service import create_app

        uvicorn.run(
            create_app(args.checkpoint, args.device),
            host=args.host,
            port=args.port,
        )


if __name__ == "__main__":
    main()
