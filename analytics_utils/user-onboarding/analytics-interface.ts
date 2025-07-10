console.log("Options:");
console.log("1. Get a user-id from the database");
console.log("2. Add a user to the database & mixpanel");
console.log(
  "3. Add an event to mixpanel for sending the user a discord invite"
);
console.log("4. Add an event to mixpanel for user joining the discord server");
console.log(
  "5. Add an event to mixpanel for user sending their external wallet address"
);
console.log(
  "6. Add an event to mixpanel for user first logging in post-Privy onboarding"
);
console.log(
  "7. Refresh the discord id from the database and send it to mixpanel"
);
console.log("8. Add a user to mixpanel");

// https://www.epochconverter.com/
// make sure you're converting from local time

import { createInterface } from "node:readline";
import axios from "axios";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";
import { Analytics, initModels } from "../../src/db/index.js";
dotenv.config();

const rl = createInterface({
  //@ts-ignore
  input: process.stdin,
  output: process.stdout,
});

const dev_project_token = process.env.MIXPANEL_DEV_TOKEN;
const prod_project_token = process.env.MIXPANEL_PROD_TOKEN;
const dev_project_id = process.env.MIXPANEL_DEV_PROJECT_ID;
const prod_project_id = process.env.MIXPANEL_PROD_PROJECT_ID;
const backendSecret = process.env.BACKEND_TOKEN_SECRET;
const authorizationMixpanel = process.env.MIXPANEL_AUTHORIZATION;

rl.question("Which option do you want to run? (1-8): ", (option) => {
  if (option === "1") {
    console.log();
    console.log("Getting a user-id from the database.");
    rl.question(
      "Do you want to search for a discord, external or embedded wallet address? (discord/external/embedded): ",
      (searchOption) => {
        if (searchOption === "discord") {
          rl.question("Enter the discord id: ", (discord_id) => {
            // Query the API and return the user-id
            console.log(`Searching for user with discord id: ${discord_id}`);
            axios
              .get(
                `https://api.slate.ceo/v1/get-analytics-user-id?discord_id=${discord_id}`
              )
              .then((response) => {
                const user_id = response.data.user_id;
                console.log(`User ID: ${user_id}`);
                rl.close();
              })
              .catch((error) => {
                console.error("Error:", error);
                rl.close();
              });
          });
        } else if (searchOption === "external") {
          rl.question(
            "Enter the external wallet address: ",
            (externalAddress) => {
              // Query the API and return the user-id
              console.log(
                `Searching for user with external wallet address: ${externalAddress}`
              );
              axios
                .get(
                  `https://api.slate.ceo/v1/get-analytics-user-id?externalAddress=${externalAddress}`
                )
                .then((response) => {
                  const user_id = response.data.user_id;
                  console.log(`User ID: ${user_id}`);
                  rl.close();
                })
                .catch((error) => {
                  console.error("Error:", error);
                  rl.close();
                });
            }
          );
        } else if (searchOption === "embedded") {
          rl.question(
            "Enter the embedded wallet address: ",
            (embeddedAddress) => {
              // Query the API and return the user-id
              console.log(
                `Searching for user with embedded wallet address: ${embeddedAddress}`
              );
              axios
                .get(
                  `https://api.slate.ceo/v1/get-analytics-user-id?embeddedAddress=${embeddedAddress}`
                )
                .then((response) => {
                  const user_id = response.data.user_id;
                  console.log(`User ID: ${user_id}`);
                  rl.close();
                })
                .catch((error) => {
                  console.error("Error:", error);
                  rl.close();
                });
            }
          );
        } else {
          console.log("Invalid search option");
          rl.close();
        }
      }
    );
  } else if (option === "2") {
    console.log();
    console.log("Adding a user to the database & mixpanel.");
    // ask for a discord_id
    rl.question("Enter the discord id: ", (discord_id) => {
      // Add the user to the database
      console.log(`Adding user with discord id: ${discord_id}`);
      axios
        .post(
          `https://api.slate.ceo/v1/analytics-user-add?secret=${backendSecret}`,
          {
            discord_id: discord_id,
          }
        )
        .then((response) => {
          console.log(response.data);
          if (response.data.status === "success") {
            const user_id = response.data.user.user_id;
            console.log(`User ID: ${user_id}`);

            console.log("Adding to Dev Project");
            // Call the mixpanel API to create a new mixpanel user
            const options_dev = {
              method: "POST",
              url: "https://api.mixpanel.com/engage#profile-set",
              params: { verbose: "1", ip: "0" },
              headers: {
                accept: "text/plain",
                "content-type": "application/json",
              },
              data: [
                {
                  $token: `${dev_project_token}`,
                  $distinct_id: `${user_id}`,
                  $set: {
                    discord_id: `${discord_id}`,
                    $name: `${discord_id}`,
                    $ip: "0",
                  },
                },
              ],
            };
            axios
              .request(options_dev)
              .then((response) => {
                console.log(response.data);
              })
              .catch((error) => {
                console.error(error);
              });

            console.log();
            console.log("Adding to Prod Project");
            // Call the mixpanel API to create a new mixpanel user
            const options_prod = {
              method: "POST",
              url: "https://api.mixpanel.com/engage#profile-set",
              params: { verbose: "1", ip: "0" },
              headers: {
                accept: "text/plain",
                "content-type": "application/json",
              },
              data: [
                {
                  $token: `${prod_project_token}`,
                  $distinct_id: `${user_id}`,
                  $set: {
                    discord_id: `${discord_id}`,
                    $name: `${discord_id}`,
                    $ip: "0",
                  },
                },
              ],
            };
            axios
              .request(options_prod)
              .then((response) => {
                console.log(response.data);
              })
              .catch((error) => {
                console.error(error);
              });
          }
          rl.close();
        })
        .catch((error) => {
          console.error("Error:", error);
          rl.close();
        });
    });
  } else if (option === "3") {
    console.log();
    // Add an event to mixpanel for sending the user a discord invite
    console.log(
      "Adding an event to mixpanel for sending the user a discord invite"
    );

    let project_id: string | undefined;
    rl.question(
      "Which project do you want to add the event to? (dev/prod): ",
      (project) => {
        if (project === "dev") {
          project_id = dev_project_id;
        } else if (project === "prod") {
          project_id = prod_project_id;
        }
        if (!project_id) {
          console.log("Invalid project");
          rl.close();
          return;
        }

        // ask for a user_id
        rl.question("Enter the user id: ", (user_id) => {
          // ask for a unix timestamp at which the event occurred
          rl.question(
            "Enter the unix timestamp at which the event occurred: ",
            (timestamp) => {
              // create uuid for the event
              const newUUID = uuidv4();
              const options = {
                method: "POST",
                url: "https://api.mixpanel.com/import",
                params: { strict: "1", project_id },
                headers: {
                  accept: "application/json",
                  "content-type": "application/json",
                  authorization: authorizationMixpanel,
                },
                data: [
                  {
                    properties: {
                      time: Number.parseInt(timestamp, 10),
                      type: "discord",
                      distinct_id: user_id,
                      $insert_id: newUUID,
                    },
                    event: "Invite Received",
                  },
                ],
              };
              axios
                .request(options)
                .then((response) => {
                  console.log(response.data);
                })
                .catch((error) => {
                  console.error(error);
                });
              rl.close();
            }
          );
        });
      }
    );
  } else if (option === "4") {
    console.log();
    // Add an event to mixpanel for user joining the discord server
    console.log(
      "Adding an event to mixpanel for user joining the discord server"
    );

    let project_id: string | undefined;
    rl.question(
      "Which project do you want to add the event to? (dev/prod): ",
      (project) => {
        if (project === "dev") {
          project_id = dev_project_id;
        } else if (project === "prod") {
          project_id = prod_project_id;
        }
        if (!project_id) {
          console.log("Invalid project");
          rl.close();
          return;
        }

        // ask for a user_id
        rl.question("Enter the user id: ", (user_id) => {
          // ask for a unix timestamp at which the event occurred
          rl.question(
            "Enter the unix timestamp at which the event occurred: ",
            (timestamp) => {
              // create uuid for the event
              const newUUID = uuidv4();
              const options = {
                method: "POST",
                url: "https://api.mixpanel.com/import",
                params: { strict: "1", project_id },
                headers: {
                  accept: "application/json",
                  "content-type": "application/json",
                  authorization: authorizationMixpanel,
                },
                data: [
                  {
                    properties: {
                      time: Number.parseInt(timestamp, 10),
                      distinct_id: user_id,
                      $insert_id: newUUID,
                    },
                    event: "Discord Joined",
                  },
                ],
              };
              axios
                .request(options)
                .then((response) => {
                  console.log(response.data);
                })
                .catch((error) => {
                  console.error(error);
                });
              rl.close();
            }
          );
        });
      }
    );
  } else if (option === "5") {
    console.log();
    // Add an event to mixpanel for user sending their external wallet address
    console.log(
      "Adding an event to mixpanel for user sending their external wallet address"
    );

    let project_id: string | undefined;
    rl.question(
      "Which project do you want to add the event to? (dev/prod): ",
      (project) => {
        if (project === "dev") {
          project_id = dev_project_id;
        } else if (project === "prod") {
          project_id = prod_project_id;
        }
        if (!project_id) {
          console.log("Invalid project");
          rl.close();
          return;
        }

        // ask for a user_id
        rl.question("Enter the user id: ", (user_id) => {
          // ask for a unix timestamp at which the event occurred
          rl.question(
            "Enter the unix timestamp at which the event occurred: ",
            (timestamp) => {
              // ask for an external wallet address
              //rl.question(
              //"Enter the external wallet address they sent: ",
              //(externalAddress) => {
              ////create uuid for the event
              //const newUUID = uuidv4();
              //const options = {
              //method: "POST",
              //url: "https://api.mixpanel.com/import",
              //params: { strict: "1", project_id },
              //headers: {
              //accept: "application/json",
              //"content-type": "application/json",
              //authorization: authorizationMixpanel,
              //},
              //data: [
              //{
              //properties: {
              //time: Number.parseInt(timestamp, 10),
              //$insert_id: newUUID,
              //"External Address": externalAddress,
              //distinct_id: user_id,
              //},
              //event: "Wallet Address Sent",
              //},
              //],
              //};
              //axios
              //.request(options)
              //.then((response) => {
              //console.log(response.data);
              //})
              //.catch((error) => {
              //console.error(error);
              //});
              //rl.close();
              rl.question(
                "Enter the external wallet address they sent: ",
                (externalAddress) => {
                  axios
                    .post(
                      `https://api.slate.ceo/v1/analytics-user-update?secret=${backendSecret}`,
                      {
                        externalAddress: externalAddress,
                        userId: user_id,
                      }
                    )
                    .then((response) => {
                      console.log(response.data);
                      if (response.data.status === "success") {
                        // create uuid for the event
                        const newUUID = uuidv4();
                        const options = {
                          method: "POST",
                          url: "https://api.mixpanel.com/import",
                          params: { strict: "1", project_id },
                          headers: {
                            accept: "application/json",
                            "content-type": "application/json",
                            authorization: authorizationMixpanel,
                          },
                          data: [
                            {
                              properties: {
                                time: Number.parseInt(timestamp, 10),
                                "External Address": externalAddress,
                                distinct_id: user_id,
                                $insert_id: newUUID,
                              },
                              event: "Wallet Address Sent",
                            },
                          ],
                        };
                        axios
                          .request(options)
                          .then((response) => {
                            console.log(response.data);
                          })
                          .catch((error) => {
                            console.error(error);
                          });
                      }
                      rl.close();
                    })
                    .catch((error) => {
                      console.error("Error:", error);
                      rl.close();
                    });
                }
              );
            }
          );
        });
      }
    );
  } else if (option === "6") {
    console.log();
    console.log(
      "Adding an event to mixpanel for user logging onto dApp for the first time post-Privy onboarding"
    );

    let project_id: string | undefined;
    rl.question(
      "Which project do you want to add the event to? (dev/prod): ",
      (project) => {
        if (project === "dev") {
          project_id = dev_project_id;
        } else if (project === "prod") {
          project_id = prod_project_id;
        }
        if (!project_id) {
          console.log("Invalid project");
          rl.close();
          return;
        }

        // ask for a user_id
        rl.question("Enter the user id: ", (user_id) => {
          // ask for a unix timestamp at which the event occurred
          rl.question(
            "Enter the unix timestamp at which the event occurred: ",
            (timestamp) => {
              // ask for an external wallet address
              rl.question(
                "Enter their external wallet address: ",
                (externalAddress) => {
                  // ask for an embedded wallet address
                  rl.question(
                    "Enter their embedded wallet address: ",
                    (embeddedAddress) => {
                      // create uuid for the event
                      const newUUID = uuidv4();
                      const options = {
                        method: "POST",
                        url: "https://api.mixpanel.com/import",
                        params: { strict: "1", project_id },
                        headers: {
                          accept: "application/json",
                          "content-type": "application/json",
                          authorization: authorizationMixpanel,
                        },
                        data: [
                          {
                            properties: {
                              time: Number.parseInt(timestamp, 10),
                              $insert_id: newUUID,
                              "External Address": externalAddress,
                              "Embedded Address": embeddedAddress,
                              distinct_id: user_id,
                            },
                            event: "Log In",
                          },
                        ],
                      };
                      axios
                        .request(options)
                        .then((response) => {
                          console.log(response.data);
                        })
                        .catch((error) => {
                          console.error(error);
                        });
                      rl.close();
                    }
                  );
                }
              );
            }
          );
        });
      }
    );
  } else if (option === "7") {
    console.log();
    console.log("Adding the discord id to mixpanel");
    rl.question("Enter the user id: ", async (user_id) => {
      // Fetch discord id from the database
      await initModels();
      const analytics_user = await Analytics.findOne({
        where: { user_id: user_id },
      });

      if (!analytics_user) {
        console.log("No user found in the database");
        rl.close();
        return;
      }

      const discord_id = analytics_user.discord_id;

      console.log();
      console.log(`Discord ID: ${discord_id}`);

      // Ready to add to mixpanel?
      rl.question("Ready to add to mixpanel? (y/n): ", (ready) => {
        if (ready === "y") {
          console.log("Adding to Dev Project");
          // Call the mixpanel API to add a discord id to the user
          const devOptions = {
            method: "POST",
            url: "https://api.mixpanel.com/engage#profile-set",
            params: { verbose: "1", ip: "0" },
            headers: {
              accept: "text/plain",
              "content-type": "application/json",
            },
            data: [
              {
                $token: `${dev_project_token}`,
                $distinct_id: `${user_id}`,
                $set: {
                  discord_id: `${discord_id}`,
                  $name: `${discord_id}`,
                  $ip: "0",
                },
              },
            ],
          };
          axios
            .request(devOptions)
            .then((response) => {
              console.log(response.data);
            })
            .catch((error) => {
              console.error(error);
            });

          console.log();
          console.log("Adding to Prod Project");
          // Call the mixpanel API to add a discord id to the user
          const prodOptions = {
            method: "POST",
            url: "https://api.mixpanel.com/engage#profile-set",
            params: { verbose: "1", ip: "0" },
            headers: {
              accept: "text/plain",
              "content-type": "application/json",
            },
            data: [
              {
                $token: `${prod_project_token}`,
                $distinct_id: `${user_id}`,
                $set: {
                  discord_id: `${discord_id}`,
                  $name: `${discord_id}`,
                  $ip: "0",
                },
              },
            ],
          };
          axios
            .request(prodOptions)
            .then((response) => {
              console.log(response.data);
            })
            .catch((error) => {
              console.error(error);
            });
        }
        rl.close();
      });
    });
  } else if (option === "8") {
    console.log();
    console.log("Adding a user directly to mixpanel.");
    rl.question("Enter the discord id: ", (discord_id) => {
      const user_id = uuidv4(); // Generate a new UUID for the user
      console.log(`Generated User ID: ${user_id}`);

      console.log("Adding to Dev Project");
      const options_dev = {
        method: "POST",
        url: "https://api.mixpanel.com/engage#profile-set",
        params: { verbose: "1", ip: "0" },
        headers: {
          accept: "text/plain",
          "content-type": "application/json",
        },
        data: [
          {
            $token: `${dev_project_token}`,
            $distinct_id: `${user_id}`,
            $set: {
              discord_id: `${discord_id}`,
              $name: `${discord_id}`,
              $ip: "0",
            },
          },
        ],
      };
      axios
        .request(options_dev)
        .then((response) => {
          console.log(response.data);
        })
        .catch((error) => {
          console.error(error);
        });

      console.log();
      console.log("Adding to Prod Project");
      const options_prod = {
        method: "POST",
        url: "https://api.mixpanel.com/engage#profile-set",
        params: { verbose: "1", ip: "0" },
        headers: {
          accept: "text/plain",
          "content-type": "application/json",
        },
        data: [
          {
            $token: `${prod_project_token}`,
            $distinct_id: `${user_id}`,
            $set: {
              discord_id: `${discord_id}`,
              $name: `${discord_id}`,
              $ip: "0",
            },
          },
        ],
      };
      axios
        .request(options_prod)
        .then((response) => {
          console.log(response.data);
          rl.close();
        })
        .catch((error) => {
          console.error(error);
          rl.close();
        });
    });
  } else {
    console.log("Invalid option");
    rl.close();
  }
});
