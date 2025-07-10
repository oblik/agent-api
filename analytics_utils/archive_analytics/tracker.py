import argparse
import asyncio
import csv
import math
import os
import re
import time
from datetime import datetime
from subprocess import check_output
from typing import Any

import httpx
import sqlalchemy
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import Field, SQLModel

load_dotenv()

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

chains = {
    "Ethereum": {
        "url": "https://api.etherscan.io/api",
        "key": os.getenv("ETHEREUM_API_KEY"),
    },
    "BinanceSmartChain": {
        "url": "https://api.bscscan.com/api",
        "key": os.getenv("BSC_API_KEY"),
    },
    "Polygon": {
        "url": "https://api.polygonscan.com/api",
        "key": os.getenv("POLYGON_API_KEY"),
    },
    "Arbitrum": {
        "url": "https://api.arbiscan.io/api",
        "key": os.getenv("ARBITRUM_API_KEY"),
    },
    "Optimism": {
        "url": "https://api-optimistic.etherscan.io/api",
        "key": os.getenv("OPTIMISM_API_KEY"),
    },
    "Base": {"url": "https://api.basescan.org/api", "key": os.getenv("BASE_API_KEY")},
    "Blast": {"url": "https://api.blastscan.io/api", "key": os.getenv("BLAST_API_KEY")},
    "Linea": {
        "url": "https://api.lineascan.build/api",
        "key": os.getenv("LINEA_API_KEY"),
    },
    "zkSync": {
        "url": "https://api-era.zksync.network/api",
        "key": os.getenv("ZKSYNC_API_KEY"),
    },
}

current_timestamp = int(time.time())
timeout = 55


class AccountTransaction(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    timeStamp: int
    chainName: str
    fromAddress: str
    toAddress: str | None = Field(default=None)
    contractAddress: str | None = Field(default=None)
    input: str | None = Field(default=None)
    functionName: str | None = Field(default=None)
    hash: str = Field(unique=True, index=True)


def read_wallets(filename):
    with open(filename, mode="r") as file:
        reader = csv.reader(file)
        wallets = [row[0].lower() for row in reader if row]
    return wallets


async def timestamp_to_block(chain_name, timestamp):
    params = {
        "module": "block",
        "action": "getblocknobytime",
        "timestamp": timestamp,
        "closest": "before",
        "apikey": chains[chain_name]["key"],
    }
    i = 0
    async with httpx.AsyncClient(timeout=timeout) as client:
        while True:
            response = await client.get(chains[chain_name]["url"], params=params)
            if (
                response.status_code == 429
                or response.status_code >= 500
                or (
                    response.status_code == 200
                    and isinstance(response.json()["result"], str)
                    and re.search("error", response.json()["result"], re.IGNORECASE)
                )
            ) and i < 5:
                print(f"block for {chain_name} retry wait exp({i})")
                await asyncio.sleep(math.exp(i))
                i += 1
            else:
                break
    response.raise_for_status()
    return int(response.json()["result"])


async def fetch_transactions(wallet, chain_name, start_block, end_block):
    params = {
        "module": "account",
        "action": "txlist",
        "address": wallet,
        "startblock": start_block,
        "endblock": end_block,
        "sort": "asc",
        "apikey": chains[chain_name]["key"],
    }
    i = 0
    async with httpx.AsyncClient(timeout=timeout) as client:
        while True:
            response = await client.get(chains[chain_name]["url"], params=params)
            if (
                response.status_code == 429
                or response.status_code >= 500
                or (
                    response.status_code == 200
                    and isinstance(response.json()["result"], str)
                    and re.search(
                        "rate limit", response.json()["result"], re.IGNORECASE
                    )
                )
            ) and i < 5:
                print(f"transactions for {chain_name} {wallet} retry wait exp({i})")
                await asyncio.sleep(math.exp(i))
                i += 1
            else:
                break
    response.raise_for_status()
    if not isinstance(response.json()["result"], list):
        raise TypeError(response.json()["result"])
    return (chain_name, response.json()["result"])


async def write_transaction(Session, actx) -> Any:
    async with Session.begin() as session:
        try:
            session.add(actx)
            await session.commit()
        except sqlalchemy.exc.IntegrityError:
            pass


async def process_chain(chain_name, Session, start_time) -> Any:
    (start, end) = (
        await timestamp_to_block(chain_name, start_time),
        await timestamp_to_block(chain_name, current_timestamp),
    )
    print(chain_name, start, end)

    wallets = read_wallets("wallets.csv")
    for wallet in wallets:
        # do not expect more then 10_000 transactions
        result = await fetch_transactions(wallet, chain_name, start, end)
        (chain_name, transactions) = result
        print(chain_name, wallet, start, end, len(transactions))

        for transaction in transactions:
            if "from" in transaction and transaction["from"] in wallets:
                actx = AccountTransaction(
                    timeStamp=int(transaction["timeStamp"]),
                    chainName=chain_name,
                    fromAddress=transaction["from"],
                    toAddress=transaction["to"],
                    contractAddress=transaction["contractAddress"],
                    input=transaction["input"],
                    functionName=transaction["functionName"],
                    hash=transaction["hash"],
                )
                await write_transaction(Session, actx)


async def main() -> Any:
    # start time
    parser = argparse.ArgumentParser()
    parser.add_argument("--start_time", type=str, default=None)
    inp = parser.parse_args()

    if inp.start_time is None:
        last = (
            check_output(
                f'journalctl --user -l -u my-wallet-tracker@{os.getenv("SPICE_ENV")} -g Succeeded -r  -o short-iso | head -2 | tail -1 | cut -f1 -d " "',
                shell=True,
            )
            .decode("utf-8")
            .strip()
        )
        if last == "--":
            # by default for the past day
            start_time = current_timestamp - (24 * 3600)
        else:
            # this process takes max 21 mins to complete
            start_time = int(datetime.fromisoformat(last).timestamp()) - (21 * 60)
    else:
        start_time = int(datetime.fromisoformat(inp.start_time).timestamp())
    print(f"start_time: {datetime.fromtimestamp(start_time)}")

    engine = create_async_engine(os.getenv("DB_URL") or "?", echo=True)

    # create db schema, if it does not exists
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)

    Session = async_sessionmaker(engine)

    tasks = []
    for chain_name in chains.keys():
        tasks += [process_chain(chain_name, Session, start_time)]
    await asyncio.gather(*tasks)


if __name__ == "__main__":
    asyncio.run(main())
