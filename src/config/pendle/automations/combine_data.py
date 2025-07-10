# combine_data.py

# Read keys from keys.txt
keys = []
with open('keys.txt', 'r') as f:
    for line in f:
        line = line.strip().rstrip(',')
        key_part = line.split(':')[0]
        key = key_part.strip('"')
        keys.append(key)

# Read addresses from addresses.txt
addresses = []
with open('addresses.txt', 'r') as f:
    for line in f:
        address = line.strip()
        addresses.append(address)

# Check if the number of keys and addresses match
if len(keys) != len(addresses):
    print("Error: The number of keys and addresses do not match.")
else:
    # Combine and print the result
    for key, address in zip(keys, addresses):
        print(f'"{key}": "{address}",')
