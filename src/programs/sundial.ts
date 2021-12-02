import type { AnchorTypes } from "@saberhq/anchor-contrib";

export type Sundial = {
  "version": "0.0.0",
  "name": "sundial",
  "instructions": [
    {
      "name": "initialize",
      "accounts": [
        {
          "name": "sundial",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "sundialAuthority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "sundialPortLiquidityWallet",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "sundialPortLpWallet",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "principleTokenMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "yieldTokenMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "feeReceiverWallet",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "reserve",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "portLiquidityMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "portLpMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "user",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "rent",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "clock",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "bumps",
          "type": {
            "defined": "SundialBumps"
          }
        },
        {
          "name": "name",
          "type": "string"
        },
        {
          "name": "endUnixTimeStamp",
          "type": "u64"
        },
        {
          "name": "portLendingProgram",
          "type": "publicKey"
        }
      ]
    },
    {
      "name": "mintPrincipleTokensAndYieldTokens",
      "accounts": [
        {
          "name": "sundial",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "sundialAuthority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "sundialPortLpWallet",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "principleTokenMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "yieldTokenMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "portAccounts",
          "accounts": [
            {
              "name": "lendingMarket",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "lendingMarketAuthority",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "reserve",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "reserveLiquidityWallet",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "reserveCollateralMint",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "portLendingProgram",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "userLiquidityWallet",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userPrincipleTokenWallet",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userYieldTokenWallet",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userAuthority",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "clock",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "redeemPrincipleTokens",
      "accounts": [
        {
          "name": "sundial",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "sundialAuthority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "sundialPortLiquidityWallet",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "principleTokenMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userLiquidityWallet",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userPrincipleTokenWallet",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userAuthority",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "clock",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "redeemYieldTokens",
      "accounts": [
        {
          "name": "sundial",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "sundialAuthority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "sundialPortLiquidityWallet",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "yieldTokenMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "principleTokenMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userLiquidityWallet",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userYieldTokenWallet",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userAuthority",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "clock",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "redeemLp",
      "accounts": [
        {
          "name": "sundial",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "sundialAuthority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "sundialPortLpWallet",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "sundialPortLiquidityWallet",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "portAccounts",
          "accounts": [
            {
              "name": "lendingMarket",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "lendingMarketAuthority",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "reserve",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "reserveLiquidityWallet",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "reserveCollateralMint",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "portLendingProgram",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "clock",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "sundial",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bumps",
            "type": {
              "defined": "SundialBumps"
            }
          },
          {
            "name": "endUnixTimeStamp",
            "type": "u64"
          },
          {
            "name": "reserve",
            "type": "publicKey"
          },
          {
            "name": "tokenProgram",
            "type": "publicKey"
          },
          {
            "name": "portLendingProgram",
            "type": "publicKey"
          }
        ]
      }
    }
  ],
  "types": [
    {
      "name": "SundialBumps",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "sundialBump",
            "type": "u8"
          },
          {
            "name": "authorityBump",
            "type": "u8"
          },
          {
            "name": "portLiquidityBump",
            "type": "u8"
          },
          {
            "name": "portLpBump",
            "type": "u8"
          },
          {
            "name": "principleMintBump",
            "type": "u8"
          },
          {
            "name": "yieldMintBump",
            "type": "u8"
          },
          {
            "name": "feeReceiverBump",
            "type": "u8"
          }
        ]
      }
    }
  ],
  "errors": [
    {
      "code": 300,
      "name": "EndTimeTooEarly",
      "msg": "End Time Earlier Than CurrentTime"
    },
    {
      "code": 301,
      "name": "InvalidPortLiquidityMint",
      "msg": "Invalid Port Liquidity Mint"
    },
    {
      "code": 302,
      "name": "InvalidPortLpMint",
      "msg": "Invalid Port Lp Mint"
    },
    {
      "code": 303,
      "name": "ReserveIsNotRefreshed",
      "msg": "Please refresh reserve before deposit"
    }
  ]
};

export const IDL: Sundial = {
  "version": "0.0.0",
  "name": "sundial",
  "instructions": [
    {
      "name": "initialize",
      "accounts": [
        {
          "name": "sundial",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "sundialAuthority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "sundialPortLiquidityWallet",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "sundialPortLpWallet",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "principleTokenMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "yieldTokenMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "feeReceiverWallet",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "reserve",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "portLiquidityMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "portLpMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "user",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "rent",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "clock",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "bumps",
          "type": {
            "defined": "SundialBumps"
          }
        },
        {
          "name": "name",
          "type": "string"
        },
        {
          "name": "endUnixTimeStamp",
          "type": "u64"
        },
        {
          "name": "portLendingProgram",
          "type": "publicKey"
        }
      ]
    },
    {
      "name": "mintPrincipleTokensAndYieldTokens",
      "accounts": [
        {
          "name": "sundial",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "sundialAuthority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "sundialPortLpWallet",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "principleTokenMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "yieldTokenMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "portAccounts",
          "accounts": [
            {
              "name": "lendingMarket",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "lendingMarketAuthority",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "reserve",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "reserveLiquidityWallet",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "reserveCollateralMint",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "portLendingProgram",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "userLiquidityWallet",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userPrincipleTokenWallet",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userYieldTokenWallet",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userAuthority",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "clock",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "redeemPrincipleTokens",
      "accounts": [
        {
          "name": "sundial",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "sundialAuthority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "sundialPortLiquidityWallet",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "principleTokenMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userLiquidityWallet",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userPrincipleTokenWallet",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userAuthority",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "clock",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "redeemYieldTokens",
      "accounts": [
        {
          "name": "sundial",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "sundialAuthority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "sundialPortLiquidityWallet",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "yieldTokenMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "principleTokenMint",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userLiquidityWallet",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userYieldTokenWallet",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "userAuthority",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "clock",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "redeemLp",
      "accounts": [
        {
          "name": "sundial",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "sundialAuthority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "sundialPortLpWallet",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "sundialPortLiquidityWallet",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "portAccounts",
          "accounts": [
            {
              "name": "lendingMarket",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "lendingMarketAuthority",
              "isMut": false,
              "isSigner": false
            },
            {
              "name": "reserve",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "reserveLiquidityWallet",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "reserveCollateralMint",
              "isMut": true,
              "isSigner": false
            },
            {
              "name": "portLendingProgram",
              "isMut": false,
              "isSigner": false
            }
          ]
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "clock",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "sundial",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bumps",
            "type": {
              "defined": "SundialBumps"
            }
          },
          {
            "name": "endUnixTimeStamp",
            "type": "u64"
          },
          {
            "name": "reserve",
            "type": "publicKey"
          },
          {
            "name": "tokenProgram",
            "type": "publicKey"
          },
          {
            "name": "portLendingProgram",
            "type": "publicKey"
          }
        ]
      }
    }
  ],
  "types": [
    {
      "name": "SundialBumps",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "sundialBump",
            "type": "u8"
          },
          {
            "name": "authorityBump",
            "type": "u8"
          },
          {
            "name": "portLiquidityBump",
            "type": "u8"
          },
          {
            "name": "portLpBump",
            "type": "u8"
          },
          {
            "name": "principleMintBump",
            "type": "u8"
          },
          {
            "name": "yieldMintBump",
            "type": "u8"
          },
          {
            "name": "feeReceiverBump",
            "type": "u8"
          }
        ]
      }
    }
  ],
  "errors": [
    {
      "code": 300,
      "name": "EndTimeTooEarly",
      "msg": "End Time Earlier Than CurrentTime"
    },
    {
      "code": 301,
      "name": "InvalidPortLiquidityMint",
      "msg": "Invalid Port Liquidity Mint"
    },
    {
      "code": 302,
      "name": "InvalidPortLpMint",
      "msg": "Invalid Port Lp Mint"
    },
    {
      "code": 303,
      "name": "ReserveIsNotRefreshed",
      "msg": "Please refresh reserve before deposit"
    }
  ]
};

export type SundialTypes = AnchorTypes<
  Sundial, {
    sundial: SundialData;
  }
>;

type Accounts = SundialTypes["Accounts"];
export type SundialData = Accounts["sundial"]
export type SundialProgram = SundialTypes["Program"];