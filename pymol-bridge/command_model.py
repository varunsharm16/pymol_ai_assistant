"""Command normalization and selection compilation for NexMol."""

from __future__ import annotations

import re
from typing import Any

ONLY_ONE_ACTION_ERROR = "Only one action is supported per request in this NexMol build."

LEGACY_ACTIONS = {
    "color_residue",
    "color_chain",
    "color_all",
    "set_cartoon",
}

SPECIAL_ACTIONS = {
    "set_background",
    "rotate_view",
    "snapshot",
    "fetch_pdb",
    "load_file",
    "get_session",
    "set_session",
    "clear_workspace",
    "get_selection_info",
    "nl_prompt",
}

CANONICAL_ACTIONS = {
    "show_representation",
    "hide_representation",
    "isolate_selection",
    "remove_selection",
    "color_selection",
    "color_by_chain",
    "color_by_element",
    "set_transparency",
    "label_selection",
    "clear_labels",
    "zoom_selection",
    "measure_distance",
    "show_contacts",
    "align_objects",
    "show_sequence_view",
    "hide_sequence_view",
    "set_sequence_view_format",
}

UNSUPPORTED_COMPAT_ACTIONS = {"orient_selection"}

SELECTION_TARGET_FIELDS = ("target", "source", "mobile")

SIMPLE_SELECTION_KINDS = {
    "all",
    "protein",
    "ligand",
    "water",
    "metals",
    "hydrogens",
    "current_selection",
}

OPTIONAL_SELECTION_SCOPE_FIELDS = ("object", "chain", "resi")

REPRESENTATION_ALIASES = {
    "ribbon": "cartoon",
    "cartoons": "cartoon",
    "stick": "sticks",
    "surface": "surface",
    "surfaces": "surface",
    "sphere": "spheres",
    "spheres": "spheres",
    "line": "lines",
    "lines": "lines",
    "mesh": "mesh",
    "meshes": "mesh",
    "dot": "dots",
    "dots": "dots",
    "cartoon": "cartoon",
    "sticks": "sticks",
}

TRANSPARENCY_REPRESENTATIONS = {"surface", "sticks", "cartoon", "spheres"}
LABEL_MODES = {"residue", "atom"}
CONTACT_MODES = {"polar"}
ALIGN_METHODS = {"align"}
FULL_RESIDUE_NAMES = {
    "ALANINE": "ALA",
    "CYSTEINE": "CYS",
    "ASPARTATE": "ASP",
    "ASPARTICACID": "ASP",
    "GLUTAMATE": "GLU",
    "GLUTAMICACID": "GLU",
    "PHENYLALANINE": "PHE",
    "GLYCINE": "GLY",
    "HISTIDINE": "HIS",
    "ISOLEUCINE": "ILE",
    "LYSINE": "LYS",
    "LEUCINE": "LEU",
    "METHIONINE": "MET",
    "ASPARAGINE": "ASN",
    "PROLINE": "PRO",
    "GLUTAMINE": "GLN",
    "ARGININE": "ARG",
    "SERINE": "SER",
    "THREONINE": "THR",
    "VALINE": "VAL",
    "TRYPTOPHAN": "TRP",
    "TYROSINE": "TYR",
}
SEQUENCE_FORMAT_ALIASES = {
    "residue_codes": "residue_codes",
    "codes": "residue_codes",
    "residue_code": "residue_codes",
    "residue codes": "residue_codes",
    "residue_names": "residue_names",
    "residue_name": "residue_names",
    "residue names": "residue_names",
    "names": "residue_names",
    "atom_names": "atom_names",
    "atom_name": "atom_names",
    "atom names": "atom_names",
    "atoms": "atom_names",
    "chain_identifiers": "chain_identifiers",
    "chain_identifier": "chain_identifiers",
    "chain_ids": "chain_identifiers",
    "chain_id": "chain_identifiers",
    "chain identifiers": "chain_identifiers",
    "chains": "chain_identifiers",
}


def normalize_residue_code(residue: str, residue_map: dict[str, str] | None = None) -> str:
    raw = (residue or "").strip().upper()
    paren_match = raw.split("(", 1)[1].split(")", 1)[0] if "(" in raw and ")" in raw else ""
    if paren_match:
        raw = paren_match
    letters = "".join(ch for ch in raw if ch.isalpha())
    if letters in FULL_RESIDUE_NAMES:
        return FULL_RESIDUE_NAMES[letters]
    if len(letters) == 1 and residue_map and letters in residue_map:
        return residue_map[letters]
    return letters


def compile_selection_spec(target: dict[str, Any], residue_map: dict[str, str] | None = None) -> str:
    normalized = normalize_selection_spec(target, residue_map=residue_map)
    kind = normalized["kind"]
    if kind == "all":
        return "all"
    if kind == "protein":
        return "polymer.protein"
    if kind == "ligand":
        return "organic"
    if kind == "water":
        return "solvent"
    if kind == "metals":
        return "metals"
    if kind == "hydrogens":
        return "hydro"
    if kind == "current_selection":
        return "sele"
    if kind == "chain":
        sel = f"chain {normalized['chain']}"
        if normalized.get("object"):
            sel += f" and %{normalized['object']}"
        return sel
    if kind == "residue":
        sel = f"resn {normalized['residue']}"
        if normalized.get("resi"):
            sel += f" and resi {normalized['resi']}"
        if normalized.get("chain"):
            sel += f" and chain {normalized['chain']}"
        if normalized.get("object"):
            sel += f" and %{normalized['object']}"
        return sel
    if kind == "atom":
        parts = [f"name {normalized['atom']}"]
        if normalized.get("residue"):
            parts.append(f"resn {normalized['residue']}")
        if normalized.get("resi"):
            parts.append(f"resi {normalized['resi']}")
        if normalized.get("chain"):
            parts.append(f"chain {normalized['chain']}")
        if normalized.get("object"):
            parts.append(f"%{normalized['object']}")
        return " and ".join(parts)
    if kind == "object":
        return f"%{normalized['object']}"
    raise ValueError(f"Unsupported target kind: {kind}")


def describe_selection_spec(target: dict[str, Any], residue_map: dict[str, str] | None = None) -> str:
    normalized = normalize_selection_spec(target, residue_map=residue_map)
    kind = normalized["kind"]
    if kind in SIMPLE_SELECTION_KINDS:
        return kind.replace("_", " ")
    if kind == "chain":
        desc = f"chain {normalized['chain']}"
        if normalized.get("object"):
            desc += f" in object {normalized['object']}"
        return desc
    if kind == "residue":
        desc = f"residue {normalized['residue']}"
        if normalized.get("resi"):
            desc += f" {normalized['resi']}"
        if normalized.get("chain"):
            desc += f" in chain {normalized['chain']}"
        if normalized.get("object"):
            desc += f" in object {normalized['object']}"
        return desc
    if kind == "atom":
        desc = f"atom {normalized['atom']}"
        if normalized.get("residue"):
            desc += f" in residue {normalized['residue']}"
        if normalized.get("resi"):
            desc += f" {normalized['resi']}"
        if normalized.get("chain"):
            desc += f" chain {normalized['chain']}"
        if normalized.get("object"):
            desc += f" object {normalized['object']}"
        return desc
    if kind == "object":
        return f"object {normalized['object']}"
    return kind


def _coerce_selection_spec(target: Any) -> dict[str, Any] | None:
    if isinstance(target, dict):
        coerced = dict(target)
        kind = str(coerced.get("kind") or "").strip().lower()
        if kind:
            return coerced
        if coerced.get("residue"):
            coerced["kind"] = "residue"
            return coerced
        if coerced.get("atom") or coerced.get("name"):
            coerced["kind"] = "atom"
            return coerced
        if coerced.get("chain"):
            coerced["kind"] = "chain"
            return coerced
        if coerced.get("object"):
            coerced["kind"] = "object"
            return coerced
        return coerced

    if not isinstance(target, str):
        return None

    text = target.strip()
    if not text:
        return None

    lower = text.lower()
    simple_map = {
        "all": "all",
        "everything": "all",
        "protein": "protein",
        "ligand": "ligand",
        "water": "water",
        "waters": "water",
        "solvent": "water",
        "metal": "metals",
        "metals": "metals",
        "hydrogen": "hydrogens",
        "hydrogens": "hydrogens",
        "selection": "current_selection",
        "selected": "current_selection",
        "current selection": "current_selection",
        "current_selection": "current_selection",
    }
    if lower in simple_map:
        return {"kind": simple_map[lower]}

    if lower.startswith("object "):
        obj = text.split(None, 1)[1].strip()
        return {"kind": "object", "object": obj} if obj else None

    if lower.startswith("chain "):
        chain = text.split(None, 1)[1].strip()
        return {"kind": "chain", "chain": chain} if chain else None

    residue_match = re.match(
        r"^(?:residue\s+)?([A-Za-z]{1,3})(?:\s+(\d+[A-Za-z]?))?(?:\s+in\s+chain\s+([A-Za-z]))?(?:\s+in\s+object\s+([A-Za-z0-9_.-]+))?$",
        text,
        re.IGNORECASE,
    )
    if residue_match:
        residue = normalize_residue_code(residue_match.group(1))
        if residue:
            coerced = {"kind": "residue", "residue": residue}
            if residue_match.group(2):
                coerced["resi"] = residue_match.group(2)
            if residue_match.group(3):
                coerced["chain"] = residue_match.group(3).upper()
            if residue_match.group(4):
                coerced["object"] = residue_match.group(4)
            return coerced

    atom_match = re.match(
        r"^atom\s+([A-Za-z0-9'_*]+)(?:\s+in\s+residue\s+([A-Za-z]{1,3}))?(?:\s+(\d+[A-Za-z]?))?(?:\s+in\s+chain\s+([A-Za-z]))?(?:\s+in\s+object\s+([A-Za-z0-9_.-]+))?$",
        text,
        re.IGNORECASE,
    )
    if atom_match:
        coerced = {"kind": "atom", "atom": atom_match.group(1).upper()}
        if atom_match.group(2):
            residue = normalize_residue_code(atom_match.group(2))
            if residue:
                coerced["residue"] = residue
        if atom_match.group(3):
            coerced["resi"] = atom_match.group(3)
        if atom_match.group(4):
            coerced["chain"] = atom_match.group(4).upper()
        if atom_match.group(5):
            coerced["object"] = atom_match.group(5)
        return coerced

    return None


def normalize_selection_spec(
    target: dict[str, Any] | None, residue_map: dict[str, str] | None = None
) -> dict[str, Any]:
    target = _coerce_selection_spec(target)
    if not isinstance(target, dict):
        raise ValueError("target must be an object")

    kind = str(target.get("kind") or "").strip().lower()
    if not kind:
        raise ValueError("target.kind is required")

    if kind in SIMPLE_SELECTION_KINDS:
        return {"kind": kind}

    if kind == "chain":
        chain = str(target.get("chain") or "").strip().upper()
        if not chain:
            raise ValueError("Chain target missing chain identifier")
        normalized = {"kind": "chain", "chain": chain}
        obj = str(target.get("object") or "").strip()
        if obj:
            normalized["object"] = obj
        return normalized

    if kind == "residue":
        residue = normalize_residue_code(str(target.get("residue") or ""), residue_map)
        if not residue:
            raise ValueError("Residue target missing residue code")
        normalized = {"kind": "residue", "residue": residue}
        resi = str(target.get("resi") or target.get("residue_number") or "").strip()
        if resi:
            normalized["resi"] = resi
        chain = str(target.get("chain") or "").strip().upper()
        if chain:
            normalized["chain"] = chain
        obj = str(target.get("object") or "").strip()
        if obj:
            normalized["object"] = obj
        return normalized

    if kind == "atom":
        atom = str(target.get("atom") or target.get("name") or "").strip().upper()
        if not atom:
            raise ValueError("Atom target missing atom name")
        normalized = {"kind": "atom", "atom": atom}
        residue = normalize_residue_code(str(target.get("residue") or ""), residue_map)
        if residue:
            normalized["residue"] = residue
        resi = str(target.get("resi") or target.get("residue_number") or "").strip()
        if resi:
            normalized["resi"] = resi
        chain = str(target.get("chain") or "").strip().upper()
        if chain:
            normalized["chain"] = chain
        obj = str(target.get("object") or "").strip()
        if obj:
            normalized["object"] = obj
        return normalized

    if kind == "object":
        obj = str(target.get("object") or "").strip()
        if not obj:
            raise ValueError("Object target missing object name")
        return {"kind": "object", "object": obj}

    raise ValueError(f"Unsupported target kind: {kind}")


def normalize_command_spec(spec: dict[str, Any], residue_map: dict[str, str] | None = None) -> dict[str, Any]:
    if not isinstance(spec, dict):
        raise ValueError("Command spec must be an object")

    if isinstance(spec.get("actions"), list):
        raise ValueError(ONLY_ONE_ACTION_ERROR)

    name = str(spec.get("name") or "").strip().lower()
    if not name:
        raise ValueError("Action name is required")

    arguments = spec.get("arguments") or {}
    if not isinstance(arguments, dict):
        raise ValueError("arguments must be an object")
    arguments = dict(arguments)

    if name in LEGACY_ACTIONS:
        return normalize_command_spec(
            _normalize_legacy_spec(name, arguments, residue_map=residue_map),
            residue_map=residue_map,
        )

    if name in SPECIAL_ACTIONS:
        return {"name": name, "arguments": _normalize_special_arguments(name, arguments)}

    if name in UNSUPPORTED_COMPAT_ACTIONS:
        return {"name": name, "arguments": {"target": normalize_selection_spec(arguments.get("target"), residue_map)}}

    if name not in CANONICAL_ACTIONS:
        raise ValueError(f"Unknown action: {name}")

    return {"name": name, "arguments": _normalize_canonical_arguments(name, arguments, residue_map)}


def _normalize_legacy_spec(
    name: str, arguments: dict[str, Any], residue_map: dict[str, str] | None = None
) -> dict[str, Any]:
    color = arguments.get("color") or arguments.get("colour")
    if name == "color_residue":
        return {
            "name": "color_selection",
            "arguments": {
                "target": {
                    "kind": "residue",
                    "residue": arguments.get("residue") or arguments.get("residue_name") or "",
                    "chain": arguments.get("chain") or "",
                },
                "color": color or "",
            },
        }

    if name == "color_chain":
        chain = str(arguments.get("chain") or "").strip()
        target = {"kind": "all"} if chain.upper() == "ALL" else {"kind": "chain", "chain": chain}
        return {
            "name": "color_selection",
            "arguments": {"target": target, "color": color or ""},
        }

    if name == "color_all":
        return {
            "name": "color_selection",
            "arguments": {"target": {"kind": "all"}, "color": color or ""},
        }

    if name == "set_cartoon":
        representation = (
            arguments.get("representation")
            or arguments.get("cartoon_type")
            or arguments.get("style")
            or "cartoon"
        )
        return {
            "name": "show_representation",
            "arguments": {
                "target": {"kind": "all"},
                "representation": representation,
            },
        }

    return {"name": name, "arguments": arguments}


def _normalize_special_arguments(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(arguments)

    if "colour" in normalized and "color" not in normalized:
        normalized["color"] = normalized.pop("colour")

    if name == "rotate_view":
        if "axis" in normalized and isinstance(normalized["axis"], str):
            normalized["axis"] = normalized["axis"].strip().upper()

    if name == "snapshot":
        normalized["filename"] = str(normalized.get("filename") or "").strip()

    if name == "fetch_pdb":
        normalized["pdb_id"] = str(normalized.get("pdb_id") or "").strip().upper()

    if name == "load_file":
        normalized["file_path"] = str(normalized.get("file_path") or "").strip()

    if name == "set_session":
        normalized["data"] = str(normalized.get("data") or "").strip()

    if name == "nl_prompt":
        normalized["text"] = str(normalized.get("text") or "").strip()

    return normalized


def _normalize_canonical_arguments(
    name: str, arguments: dict[str, Any], residue_map: dict[str, str] | None
) -> dict[str, Any]:
    normalized = dict(arguments)

    if "colour" in normalized and "color" not in normalized:
        normalized["color"] = normalized.pop("colour")

    if name == "clear_labels":
        normalized.pop("target", None)
        return normalized

    if name in {
        "show_representation",
        "hide_representation",
        "isolate_selection",
        "remove_selection",
        "color_selection",
        "color_by_chain",
        "color_by_element",
        "set_transparency",
        "label_selection",
        "clear_labels",
        "zoom_selection",
    }:
        normalized["target"] = normalize_selection_spec(normalized.get("target"), residue_map)

    if name == "set_sequence_view_format":
        normalized["format"] = normalize_sequence_format(normalized.get("format"))

    if name in {"measure_distance", "show_contacts"}:
        normalized["source"] = normalize_selection_spec(normalized.get("source"), residue_map)
        normalized["target"] = normalize_selection_spec(normalized.get("target"), residue_map)

    if name == "align_objects":
        normalized["mobile"] = normalize_selection_spec(normalized.get("mobile"), residue_map)
        normalized["target"] = normalize_selection_spec(normalized.get("target"), residue_map)

    if name in {"show_representation", "hide_representation", "isolate_selection", "set_transparency"}:
        representation = str(normalized.get("representation") or "").strip().lower()
        if name == "hide_representation" and representation == "everything":
            normalized["representation"] = "everything"
        elif representation:
            normalized["representation"] = normalize_representation(representation)
        elif name == "show_representation":
            raise ValueError("representation is required")

    if name == "color_selection":
        color = str(normalized.get("color") or "").strip()
        if not color:
            raise ValueError("color is required")
        normalized["color"] = color.lower()

    if name == "set_transparency":
        value = normalized.get("value")
        if value is None:
            raise ValueError("value is required")
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            raise ValueError("value must be numeric") from None
        if numeric > 1.0:
            numeric /= 100.0
        normalized["value"] = max(0.0, min(1.0, numeric))
        if normalized.get("representation") not in TRANSPARENCY_REPRESENTATIONS:
            normalized["representation"] = "surface"

    if name == "label_selection":
        mode = str(normalized.get("mode") or "residue").strip().lower()
        if mode not in LABEL_MODES:
            raise ValueError(f"Unsupported label mode: {mode}")
        normalized["mode"] = mode
        if normalized.get("template") is not None:
            normalized["template"] = str(normalized["template"])

    if name == "show_contacts":
        mode = str(normalized.get("mode") or "polar").strip().lower()
        if mode not in CONTACT_MODES:
            raise ValueError(f"Unsupported contacts mode: {mode}")
        normalized["mode"] = mode

    if name == "align_objects":
        method = str(normalized.get("method") or "align").strip().lower()
        if method not in ALIGN_METHODS:
            raise ValueError(f"Unsupported alignment method: {method}")
        normalized["method"] = method

    if name in {"measure_distance", "show_contacts", "align_objects"}:
        object_name = normalized.get("object_name")
        if object_name is not None:
            normalized["object_name"] = str(object_name).strip()

    return normalized


def normalize_representation(value: str) -> str:
    representation = REPRESENTATION_ALIASES.get(value.strip().lower())
    if not representation:
        raise ValueError(f"Unsupported representation: {value}")
    return representation


def normalize_sequence_format(value: Any) -> str:
    fmt = str(value or "").strip().lower()
    normalized = SEQUENCE_FORMAT_ALIASES.get(fmt)
    if not normalized:
        raise ValueError(f"Unsupported sequence format: {value}")
    return normalized
