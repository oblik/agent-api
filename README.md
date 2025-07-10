# Slate Protocol Integration Guide

## Overview

Protocol integrations can be prioritized based on one or more of the following metrics:
- **Relative benefit between our flows and existing flows** (qualitative based on hypothesized value prop)
- **Buzz in the industry** (qualitative)
- **Usage** (volume, TVL, users, etc) (quantitative)
- **Growth** (volume, TVL, users, etc) (quantitative)
- **Integration difficulty** (qualitative)

To start, protocol integration prioritization for integrations done by Slate core contributors will be determined by:
1. **Usage**, namely interactions and TVL
2. **Integration difficulty**, to a lesser degree.

Quantitative metrics are less risky than qualitative metrics, and the degree of reasoning about qualitative metrics probably will increase over time.

## Table of Contents

- [Step-by-Step Integration Process](#step-by-step-integration-process)
    - [Step 1: API Structure](#step-1-api-structure)
    - [Step 2: Data Mapping](#step-2-data-mapping)
    - [Step 3: Testing and Validation](#step-3-testing-and-validation)
    - [Step 4: Deployment](#step-4-deployment)

## Step-by-Step Integration Process

### Step 1: API Structure

Users make a call to a specific action, such as borrow or deposit. The `action` function in `src/controllers/wallet.controller.js` handles the call by invoking `getActionTx` or `getPerpActionTx` in `src/utils/index.js`. After some validation, `getProtocolActionTx` is called. This function utilizes the base function from `src/utils/actions/{protocolName}.js`. The base function, which is integral to the integration, employs a switch statement for each supported action on the protocol to return a list of transactions needed to execute that action.

### Step 2: Data Mapping

The base logic in the individual protocol files located in `src/utils/actions` utilizes addresses, ABIs, and other necessary data from the `src/config/{protocolName}` directory to maintain organization. Relevant data should be stored here.

### Step 3: Testing and Validation

Once the base logic for a protocol is established, it requires unit testing. Unit tests are categorized by action in the `src/__tests__/unit` folder. For every combination of action, protocol, pool, and chain now supported, a corresponding unit test should be written in the specific action file. For instance, if an integrated protocol supports 5 pools for deposits on Ethereum, there should be 5 different unit tests in `src/__tests__/unit/deposit.test.js`, one for each pool. Each unit test should simulate the transactions on a forked network, ensuring the transactions are accepted by the chain without errors.

### Step 4: Deployment

Upon completing the above steps, submit a Pull Request (PR) to the staging branch using the format: `{protocolName} integration`.
