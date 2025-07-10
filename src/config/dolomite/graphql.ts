// import { ApolloClient, HttpLink, InMemoryCache, gql } from "apollo-boost";
// import fetch from "cross-fetch";

// export const client = new ApolloClient({
//   link: new HttpLink({
//     uri: "https://api.thegraph.com/subgraphs/name/dolomite-exchange/dolomite-v2-arbitrum",
//     fetch,
//   }),
//   cache: new InMemoryCache(),
// });

// export const query = gql`
//   query userBorrowPositions($address: String) {
//     borrowPositions(where: { effectiveUser: $address, status: "OPEN" }) {
//       id
//       effectiveUser {
//         totalBorrowPositionCount
//         totalBorrowVolumeOriginatedUSD
//       }
//       supplyTokens {
//         id
//         symbol
//       }
//       borrowTokens {
//         id
//         symbol
//       }
//       amounts {
//         token {
//           symbol
//         }
//         amountWei
//         amountPar
//       }
//     }
//   }
// `;
