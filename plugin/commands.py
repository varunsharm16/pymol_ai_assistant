# from pymol import cmd

# def color_residue(cmd, residue: str, chain: str, color: str):
#     """Color all residues matching name and chain."""
#     selection = f"resn {residue} and chain {chain}"
#     cmd.color(color, selection)

# def set_background(cmd, color: str):
#     """Set the background color."""
#     cmd.bg_color(color)

# def rotate_view(cmd, axis: str, angle: float):
#     """Rotate the view around the given axis by angle degrees."""
#     cmd.rotate(axis, angle)

# def set_cartoon(cmd, representation: str):
#     """Show the given representation (e.g., cartoon, surface)."""
#     cmd.show(representation, "all")

# def snapshot(cmd, filename: str):
#     """Save a PNG snapshot to filename."""
#     cmd.png(filename, dpi=300)

