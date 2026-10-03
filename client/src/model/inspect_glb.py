import json
import struct
import sys

path = r"D:\Learning\local-moba-game\client\src\model\rimuru_tempest.glb"
with open(path, 'rb') as f:
    data = f.read()

magic, version, length = struct.unpack_from('<III', data, 0)
assert magic == 0x46546C67, "Not a glTF binary file"

offset = 12
json_chunk = None
while offset < length:
    chunk_length, chunk_type = struct.unpack_from('<II', data, offset)
    chunk_data = data[offset+8:offset+8+chunk_length]
    if chunk_type == 0x4E4F534A:  # JSON
        json_chunk = chunk_data
        break
    offset += 8 + chunk_length

gltf = json.loads(json_chunk)

print("Animations:")
for i, anim in enumerate(gltf.get('animations', [])):
    print(f"  [{i}] name={anim.get('name')}")

print("\nNodes:")
for i, node in enumerate(gltf.get('nodes', [])):
    print(f"  [{i}] name={node.get('name')}")

print("\nMeshes:")
for i, mesh in enumerate(gltf.get('meshes', [])):
    print(f"  [{i}] name={mesh.get('name')}")
