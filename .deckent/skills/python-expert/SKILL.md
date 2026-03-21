# Python Expert

## Type Hints (PEP 484+)
- Add type hints to all function signatures: parameters and return types.
- Use `from __future__ import annotations` for postponed evaluation (PEP 563) in Python 3.7-3.9.
- Use built-in generics (`list[str]`, `dict[str, int]`) in Python 3.9+. Use `typing` module for older versions.
- Use `Optional[T]` (or `T | None` in 3.10+) for nullable parameters. Never use `None` as default without declaring the type.
- Use `TypeVar` for generic functions, `Protocol` for structural subtyping (duck typing with type safety).
- Use `TypedDict` for dictionary shapes with known keys.
- Run `mypy --strict` or `pyright` in CI to catch type errors.

## Code Style (PEP 8)
- Follow PEP 8 naming: `snake_case` for functions/variables, `PascalCase` for classes, `UPPER_SNAKE_CASE` for constants.
- Maximum line length: 88 characters (Black default) or 79 (strict PEP 8).
- Use f-strings for string formatting. Avoid `%` formatting and `.format()`.
- Prefer list/dict/set comprehensions over `map`/`filter` with lambdas for readability.
- Use `pathlib.Path` over `os.path` for file system operations. It is object-oriented and cross-platform.

## Project Structure
- Use `pyproject.toml` as the single source of truth for project metadata and tool configuration.
- Use virtual environments (`venv`, `poetry`, or `uv`) for dependency isolation. Never install globally.
- Pin dependency versions in `requirements.txt` or `poetry.lock`. Use ranges only in `pyproject.toml`.
- Organize packages with `__init__.py`. Keep it minimal -- explicit imports, no star exports.

## Async/Await
- Use `asyncio` for I/O-bound concurrency. Use `multiprocessing` or `concurrent.futures` for CPU-bound work.
- Always use `async with` for async context managers (database connections, HTTP sessions).
- Use `asyncio.gather()` for concurrent tasks. Use `asyncio.TaskGroup` (3.11+) for structured concurrency.
- Never mix sync and async code without proper bridging (`asyncio.to_thread`, `loop.run_in_executor`).
- Handle cancellation with `try/except asyncio.CancelledError` in long-running tasks.

## Testing (pytest)
- Use pytest as the test framework. Organize tests in a `tests/` directory mirroring the source structure.
- Use fixtures for setup/teardown. Prefer function-scoped fixtures for isolation.
- Use `@pytest.mark.parametrize` for data-driven tests.
- Use `pytest-asyncio` for async test functions.
- Use `monkeypatch` for patching. Prefer it over `unittest.mock.patch` for simpler syntax.
- Aim for 80%+ coverage. Use `pytest-cov` for measurement.

## Data Classes and Models
- Use `@dataclass` for plain data containers with automatic `__init__`, `__repr__`, `__eq__`.
- Use `frozen=True` for immutable data classes.
- Use Pydantic `BaseModel` for data validation and serialization (API boundaries).
- Use `NamedTuple` for lightweight immutable records.

## Error Handling
- Define custom exception hierarchies for your application domain.
- Use specific exception types in `except` clauses. Never use bare `except:`.
- Use `contextlib.suppress` for expected exceptions that should be silently ignored.
- Log exceptions with `logger.exception()` to capture stack traces.
- Use `else` clause in try blocks for code that should run only when no exception occurred.
