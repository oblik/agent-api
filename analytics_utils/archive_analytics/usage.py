import requests
import csv
import os
import matplotlib.pyplot as plt
from datetime import datetime
from collections import defaultdict
import time
from dotenv import load_dotenv

load_dotenv()

# Function to read wallets from a CSV file
def read_wallets(filename):
    with open(filename, mode='r') as file:
        reader = csv.reader(file)
        wallets = [row[0] for row in reader if row]  # Assumes wallets are in the first column
    return wallets

# Function to get block number from timestamp
def timestamp_to_block(chain_info, timestamp):
    params = {
        'module': 'block',
        'action': 'getblocknobytime',
        'timestamp': timestamp,
        'closest': 'before',
        'apikey': chain_info['key']
    }
    response = requests.get(chain_info['url'], params=params)
    if response.status_code == 200:
        return int(response.json()['result'])
    else:
        return None

# Function to fetch transactions for a given wallet and chain
def fetch_transactions(wallet, chain_info, start_block, end_block):
    params = {
        'module': 'account',
        'action': 'txlist',
        'address': wallet,
        'startblock': start_block,
        'endblock': end_block,
        'sort': 'asc',
        'apikey': chain_info['key']
    }
    response = requests.get(chain_info['url'], params=params)
    if response.status_code == 200:
        return response.json()['result']
    else:
        return []

# Average block time for each chain in seconds
average_block_time = {
    "Ethereum": 12,
    "BinanceSmartChain": 3,
    "Polygon": 2.1,
    "Avalanche": 2.1,
    "Arbitrum": 0.25,
    "Optimism": 2, 
    "Base": 2,
    "Blast": 2,
    "Linea": 3,
    "zkSync": 360,
}

# Read wallets from CSV
wallets = read_wallets('wallets.csv')

# Dictionary of chains with their respective API URLs and API Keys from environment variables
# TODO: add mode and mantle and manta and scroll
chains = {
    "Ethereum": {"url": "https://api.etherscan.io/api", "key": os.getenv('ETHEREUM_API_KEY')},
    "BinanceSmartChain": {"url": "https://api.bscscan.com/api", "key": os.getenv('BSC_API_KEY')},
    "Polygon": {"url": "https://api.polygonscan.com/api", "key": os.getenv('POLYGON_API_KEY')},
    "Arbitrum": {"url": "https://api.arbiscan.io/api", "key": os.getenv('ARBITRUM_API_KEY')},
    "Optimism": {"url": "https://api-optimistic.etherscan.io/api", "key": os.getenv('OPTIMISM_API_KEY')},
    "Base": {"url": "https://api.basescan.org/api", "key": os.getenv('BASE_API_KEY')},
    "Blast": {"url": "https://api.blastscan.io/api", "key": os.getenv('BLAST_API_KEY')},
    "Linea": {"url": "https://api.lineascan.build/api", "key": os.getenv('LINEA_API_KEY')},
    "zkSync": {"url": "https://api-era.zksync.network/api", "key": os.getenv('ZKSYNC_API_KEY')}
}

# Start time in Unix timestamp
# 1 wk ago
start_time = 1713724564
start_blocks = {}
end_blocks = {}

# Calculate current timestamp once to minimize calls to datetime.now()
current_timestamp = int(time.time())

# Create a histogram dictionary
histogram = defaultdict(int)

for chain_name, chain_info in chains.items():
    print(chain_info)
    start_blocks[chain_name] = timestamp_to_block(chain_info, start_time)
    end_blocks[chain_name] = timestamp_to_block(chain_info, current_timestamp)

# Loop through each wallet and each chain
for wallet in wallets:
    for chain_name, chain_info in chains.items():
        start_block = start_blocks[chain_name]
        if start_block is None:
            continue

        end_block = end_blocks[chain_name]
        if end_block is None:
            continue

        # Fetch transactions in batches of 10000 blocks
        batch_size = 10000
        for start in range(start_block, end_block, batch_size):
            end = min(start + batch_size, end_block)
            print(wallet, chain_info, start, end)
            transactions = fetch_transactions(wallet, chain_info, start, end)
            for transaction in transactions:
                if not transaction:
                    continue
                contract_address = transaction.get('to', '') or transaction.get('contractAddress', '')
                if contract_address:
                    key = (chain_name, contract_address)
                    histogram[key] += 1
            time.sleep(1)

# Print the histogram
for key, count in histogram.items():
    print(f"{key}: {count}")

# Save the histogram to a CSV file
with open('histogram_results.csv', 'w', newline='') as file:
    writer = csv.writer(file)
    writer.writerow(['Chain', 'Contract Address', 'Count'])
    for key, count in histogram.items():
        writer.writerow([key[0], key[1], count])

# Optional: Graph the histogram using matplotlib
# Prepare data for plotting
labels = [f"{chain}:\n{contract[:6]}..." for chain, contract in histogram.keys()]
counts = list(histogram.values())

# Create bar plot
plt.figure(figsize=(10, 8))
plt.barh(labels, counts, color='skyblue')
plt.xlabel('Number of Interactions')
plt.title('Interactions by Contract and Chain')
plt.gca().invert_yaxis()  # Invert y axis for better readability of contracts
plt.show()