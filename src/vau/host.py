# Vector Abliteration Units
# Copyright (C) 2026 David M. Berry
# SPDX-License-Identifier: GPL-3.0-or-later
"""
The host: what an application gives its units.

An application (Abliteration Lens, or a later tool for diffusion or audio models) subclasses
Host for the model it has loaded, says what it can offer in capabilities(), and implements
the methods that go with those capabilities. Units reach the model only through these
methods (by way of their UnitContext), so the same unit runs in any host that offers what
the unit needs.

The host registers every hook a unit asks for and removes it after the run, and it may wrap
each hook (to watch how much it changes, for instance). A unit never holds a hook handle.
"""
from __future__ import annotations

from typing import Any, Callable, Dict, Iterable, List, Set


class UnitError(ValueError):
    """A strip that cannot work as written: the message says why, in a sentence for the user."""


class Host:
    """The methods units call. Each raises NotImplementedError unless the host implements it;
    a host lists what it implements in capabilities()."""

    name = "host"

    def capabilities(self) -> Set[str]:
        return set()

    def error(self, lineno: int, msg: str) -> Exception:
        return UnitError(f"Line {lineno}: {msg}")

    # --- where the model is -----------------------------------------------------------
    @property
    def device(self):
        raise NotImplementedError

    def layers(self, strip) -> List[int]:
        """The places in the stream a strip's target names ("stream")."""
        raise NotImplementedError

    def depth(self) -> int:
        """How many blocks the model has."""
        raise NotImplementedError

    def blocks(self, strip) -> List[int]:
        """The blocks a strip's target names (block=, attn=, mlp=), counted from 0 ("output", "weights")."""
        raise NotImplementedError

    def component(self, kind: str, layer: int):
        """A block's output projection, for kind "attn" (the map from the heads to the stream) or
        "mlp" (the map from the MLP's hidden units to the stream) ("output", "weights")."""
        raise NotImplementedError

    def component_path(self, kind: str, layer: int) -> str:
        """How the Code view names a component."""
        return f"{kind}[{layer}]"

    # --- measurements on the unchanged model, cached by the host ----------------------
    def stats(self) -> Dict[str, Any]:
        """Per layer of the stream: "mean" (layers, d), "std" (layers, d), "norm" (layers,) ("stats")."""
        raise NotImplementedError

    def pca(self, layer: int):
        """The principal directions of the stream at a layer, by variance, as rows ("pca")."""
        raise NotImplementedError

    def pca_scales(self, layer: int):
        """The stream's spread along each principal direction at a layer, in pca()'s order ("pca")."""
        raise NotImplementedError

    def direction(self, name: str, lineno: int):
        """A named direction, with .vector(layer, device) and .unit(layer, device) ("directions")."""
        raise NotImplementedError

    def direction_texts(self, name: str, lineno: int) -> Dict[str, List[str]]:
        """The texts a direction was made from: {"positive": [...], "negative": [...]}. An empty
        negative list means the positive texts were set against the reference set ("contrasts")."""
        raise NotImplementedError

    def reference_texts(self) -> List[str]:
        """The host's reference set of ordinary inputs ("texts")."""
        raise NotImplementedError

    def capture(self, texts: Iterable[str], modules: Dict[Any, Any]) -> Dict[Any, Any]:
        """Run the unchanged model on each text and return, for each named module, its input
        and output at every position, stacked: {key: (inputs, outputs)} ("texts")."""
        raise NotImplementedError

    def cache(self, kind: str, key: str):
        """A place to keep what a unit fits or measures: a Path, or None for no disk cache."""
        return None

    # --- the run ------------------------------------------------------------------------
    def positions(self, n: int, device):
        """The absolute positions of the n positions in the current forward pass (for windows)."""
        raise NotImplementedError

    def prompt_length(self) -> int:
        """How many positions the prompt takes (for windows)."""
        raise NotImplementedError

    def memory(self, strip, layer: int) -> Dict[Any, Any]:
        """A store that lasts one run, for units that keep earlier positions ("ordered")."""
        raise NotImplementedError

    def hook_stream(self, strip, make: Callable[[int], Callable]) -> None:
        """At every place the strip names, call make(layer) for an edit (h, pos) -> h and apply
        it to the stream there. h is (batch, positions, d); pos holds each position's absolute
        index along the axis ("stream")."""
        raise NotImplementedError

    def hook_output(self, strip, module, fn: Callable) -> None:
        """A forward hook fn(module, args, output) -> output on one module ("output")."""
        raise NotImplementedError

    def hook_input(self, strip, module, fn: Callable) -> None:
        """A forward pre-hook fn(module, args) -> args on one module ("output")."""
        raise NotImplementedError

    def on_restore(self, fn: Callable) -> None:
        """Called after the run, to put back anything a unit changed ("weights")."""
        raise NotImplementedError

    # --- the Code view ------------------------------------------------------------------
    def stream_code(self, strip, expr: str) -> List[str]:
        """The registration lines for an edit expression at each place the strip names."""
        return [f"hook_stream({expr})"]
