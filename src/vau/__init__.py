# Vector Abliteration Units
# Copyright (C) 2026 David M. Berry
# SPDX-License-Identifier: GPL-3.0-or-later
"""
Vector Abliteration Units (VAU): a standard for units that change what a model does from
inside, and the parts a host needs to load and run them. See SPEC.md.
"""
from . import hostfx
from .explain import files as explain_files
from .look import files as look_files
from .collection import COLLECTIONS
from .context import Line, UnitContext, attach, code, prepare, read, validate
from .host import Host, UnitError
from .manifest import CAPABILITIES, VAU_VERSION, check, requirements
from .registry import BUILTIN, Registry, Unit

__version__ = "0.2.10"
__all__ = ["VAU_VERSION", "CAPABILITIES", "Host", "UnitError", "Registry", "Unit", "UnitContext", "Line",
           "check", "requirements", "validate", "prepare", "attach", "read", "code", "BUILTIN", "explain_files", "look_files", "COLLECTIONS", "__version__"]
