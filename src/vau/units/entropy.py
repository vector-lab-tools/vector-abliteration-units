# Vector Abliteration Units: Entropy (a meter)
# Copyright (C) 2026 David M. Berry
# SPDX-License-Identifier: GPL-3.0-or-later
import math

UNIT = {
    "vau": 1, "id": "entropy", "title": "Entropy", "category": "meter", "level": "probe",
    "what": "How uncertain the model is about the next token, in bits, step by step",
    "site": "logits", "axis": "any", "targets": [], "requires": [],
    "params": [],
    "display": {"kind": "series", "label": "uncertainty about the next token", "unit": "bits"},
    "example": "entropy",
    "help": "The entropy of the model's next-token distribution at each step, in bits: 0 when the model is "
            "sure of the next token, about 15.6 for GPT-2 if every token were equally likely. Read on the "
            "original text with the model unchanged and on the diverged text with the chain in place, so the "
            "two lines show whether the chain leaves the model surer or less sure of itself.",
    "version": "1.0", "author": "David M. Berry", "licence": "GPL-3.0-or-later",
}


def entropy_bits(logprobs):
    """The entropy of each row of log probabilities, in bits."""
    return (-(logprobs.exp() * logprobs).sum(-1) / math.log(2)).tolist()


def read(u, data):
    return [{"value": round(float(h), 4)} for h in entropy_bits(data["logprobs"].float())]


def code(u):
    return {"lines": ["# a meter: no hook; afterwards each text's next-token log probabilities are read",
                      "# reading: entropy_bits(log_softmax(logits)) at each step"], "uses": [entropy_bits]}
