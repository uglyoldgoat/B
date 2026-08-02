"""keyguesser -- a Bitcoin private key search tool and a lesson in scale."""

from .addresses import derive
from .search import SearchConfig, run_search

__version__ = "0.1.0"
__all__ = ["derive", "SearchConfig", "run_search", "__version__"]
