"""Unit tests for NexMol command normalization and selection compilation."""

import importlib.util
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parent.parent / "pymol-bridge" / "command_model.py"
SPEC = importlib.util.spec_from_file_location("plugin_command_model", MODULE_PATH)
command_model = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(command_model)

ONLY_ONE_ACTION_ERROR = command_model.ONLY_ONE_ACTION_ERROR
compile_selection_spec = command_model.compile_selection_spec
normalize_command_spec = command_model.normalize_command_spec
normalize_residue_code = command_model.normalize_residue_code


def test_normalize_residue_code_one_letter():
    residue_map = {"A": "ALA", "C": "CYS"}
    assert normalize_residue_code("a", residue_map) == "ALA"
    assert normalize_residue_code("CYS", residue_map) == "CYS"


def test_normalize_residue_code_full_name():
    assert normalize_residue_code("leucine") == "LEU"
    assert normalize_residue_code("serine (SER)") == "SER"


def test_compile_chain_selection():
    assert compile_selection_spec({"kind": "chain", "chain": "a"}) == "chain A"


def test_compile_residue_selection_with_chain():
    residue_map = {"D": "ASP"}
    selection = compile_selection_spec(
        {"kind": "residue", "residue": "d", "chain": "b"},
        residue_map=residue_map,
    )
    assert selection == "resn ASP and chain B"


def test_compile_residue_selection_with_number_and_object():
    selection = compile_selection_spec(
        {"kind": "residue", "residue": "ALA", "resi": "21", "chain": "A", "object": "1crn"}
    )
    assert selection == "resn ALA and resi 21 and chain A and %1crn"


def test_compile_atom_selection():
    selection = compile_selection_spec(
        {
            "kind": "atom",
            "atom": "CA",
            "residue": "ASP",
            "resi": "21",
            "chain": "B",
            "object": "model1",
        }
    )
    assert selection == "name CA and resn ASP and resi 21 and chain B and %model1"


def test_compile_object_selection():
    assert compile_selection_spec({"kind": "object", "object": "ligand_pose"}) == "%ligand_pose"


def test_normalize_legacy_color_residue_to_canonical():
    residue_map = {"A": "ALA"}
    spec = normalize_command_spec(
        {
            "name": "color_residue",
            "arguments": {"residue": "A", "chain": "b", "color": "green"},
        },
        residue_map=residue_map,
    )
    assert spec["name"] == "color_selection"
    assert spec["arguments"]["target"] == {
        "kind": "residue",
        "residue": "ALA",
        "chain": "B",
    }
    assert spec["arguments"]["color"] == "green"


def test_normalize_legacy_set_cartoon_to_show_representation():
    spec = normalize_command_spec(
        {"name": "set_cartoon", "arguments": {"representation": "ribbon"}}
    )
    assert spec == {
        "name": "show_representation",
        "arguments": {
            "target": {"kind": "all"},
            "representation": "cartoon",
        },
    }


def test_set_transparency_clamps_percentages():
    spec = normalize_command_spec(
        {
            "name": "set_transparency",
            "arguments": {
                "target": {"kind": "protein"},
                "representation": "surface",
                "value": 40,
            },
        }
    )
    assert spec["arguments"]["value"] == 0.4


def test_normalize_sequence_view_format():
    spec = normalize_command_spec(
        {"name": "set_sequence_view_format", "arguments": {"format": "residue names"}}
    )
    assert spec == {
        "name": "set_sequence_view_format",
        "arguments": {"format": "residue_names"},
    }


def test_align_objects_requires_supported_method():
    try:
        normalize_command_spec(
            {
                "name": "align_objects",
                "arguments": {
                    "mobile": {"kind": "object", "object": "a"},
                    "target": {"kind": "object", "object": "b"},
                    "method": "super",
                },
            }
        )
    except ValueError as exc:
        assert "Unsupported alignment method" in str(exc)
    else:
        raise AssertionError("Expected ValueError for unsupported alignment method")


def test_compound_actions_are_rejected():
    try:
        normalize_command_spec({"actions": [{"name": "remove_selection"}]})
    except ValueError as exc:
        assert str(exc) == ONLY_ONE_ACTION_ERROR
    else:
        raise AssertionError("Expected ValueError for compound action payload")


def test_normalize_selection_spec_coerces_selected_string_target():
    spec = normalize_command_spec(
        {
            "name": "color_selection",
            "arguments": {
                "target": "selected",
                "color": "red",
            },
        }
    )
    assert spec == {
        "name": "color_selection",
        "arguments": {
            "target": {"kind": "current_selection"},
            "color": "red",
        },
    }


def test_normalize_selection_spec_infers_object_kind_from_dict():
    spec = normalize_command_spec(
        {
            "name": "zoom_selection",
            "arguments": {
                "target": {"object": "1crn"},
            },
        }
    )
    assert spec == {
        "name": "zoom_selection",
        "arguments": {
            "target": {"kind": "object", "object": "1crn"},
        },
    }


def test_normalize_selection_spec_coerces_residue_string_target():
    spec = normalize_command_spec(
        {
            "name": "color_selection",
            "arguments": {
                "target": "residue asp 21 in chain b",
                "color": "red",
            },
        }
    )
    assert spec == {
        "name": "color_selection",
        "arguments": {
            "target": {"kind": "residue", "residue": "ASP", "resi": "21", "chain": "B"},
            "color": "red",
        },
    }


def test_normalize_selection_spec_coerces_atom_string_target():
    spec = normalize_command_spec(
        {
            "name": "label_selection",
            "arguments": {
                "target": "atom ca in residue asp 21 in chain b",
                "mode": "atom",
            },
        }
    )
    assert spec == {
        "name": "label_selection",
        "arguments": {
            "target": {"kind": "atom", "atom": "CA", "residue": "ASP", "resi": "21", "chain": "B"},
            "mode": "atom",
        },
    }
