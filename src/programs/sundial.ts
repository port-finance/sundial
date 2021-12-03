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
          "name": "durationInSeconds",
          "type": "i64"
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
          "isMut": false,
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
          "isMut": false,
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
          "isMut": false,
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
            "name": "durationInDays",
            "type": "i64"
          },
          {
            "name": "endUnixTimeStamp",
            "type": "i64"
          },
          {
            "name": "startExchangeRate",
            "type": {
              "array": [
                "u64",
                2
              ]
            }
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
  "events": [
    {
      "name": "DidDeposit",
      "fields": [
        {
          "name": "liquiditySpent",
          "type": "u64",
          "index": false
        },
        {
          "name": "principleTokenMinted",
          "type": "u64",
          "index": false
        },
        {
          "name": "yieldTokenMinted",
          "type": "u64",
          "index": false
        }
      ]
    },
    {
      "name": "DidRedeemPrinciple",
      "fields": [
        {
          "name": "principleBurned",
          "type": "u64",
          "index": false
        },
        {
          "name": "liquidityRedeemed",
          "type": "u64",
          "index": false
        }
      ]
    },
    {
      "name": "DidRedeemYield",
      "fields": [
        {
          "name": "yieldBurned",
          "type": "u64",
          "index": false
        },
        {
          "name": "liquidityRedeemed",
          "type": "u64",
          "index": false
        }
      ]
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
    },
    {
      "code": 304,
      "name": "NotRedeemLpYet",
      "msg": "Please call redeem before first redeem of principle or yield"
    },
    {
      "code": 305,
      "name": "NotEndYet",
      "msg": "Not the redeem time yet"
    },
    {
      "code": 306,
      "name": "AlreadyEnd",
      "msg": "Contract already end"
    },
    {
      "code": 307,
      "name": "MathOverflow",
      "msg": "MathOverflow"
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
          "name": "durationInSeconds",
          "type": "i64"
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
          "isMut": false,
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
          "isMut": false,
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
          "isMut": false,
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
            "name": "durationInDays",
            "type": "i64"
          },
          {
            "name": "endUnixTimeStamp",
            "type": "i64"
          },
          {
            "name": "startExchangeRate",
            "type": {
              "array": [
                "u64",
                2
              ]
            }
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
  "events": [
    {
      "name": "DidDeposit",
      "fields": [
        {
          "name": "liquiditySpent",
          "type": "u64",
          "index": false
        },
        {
          "name": "principleTokenMinted",
          "type": "u64",
          "index": false
        },
        {
          "name": "yieldTokenMinted",
          "type": "u64",
          "index": false
        }
      ]
    },
    {
      "name": "DidRedeemPrinciple",
      "fields": [
        {
          "name": "principleBurned",
          "type": "u64",
          "index": false
        },
        {
          "name": "liquidityRedeemed",
          "type": "u64",
          "index": false
        }
      ]
    },
    {
      "name": "DidRedeemYield",
      "fields": [
        {
          "name": "yieldBurned",
          "type": "u64",
          "index": false
        },
        {
          "name": "liquidityRedeemed",
          "type": "u64",
          "index": false
        }
      ]
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
    },
    {
      "code": 304,
      "name": "NotRedeemLpYet",
      "msg": "Please call redeem before first redeem of principle or yield"
    },
    {
      "code": 305,
      "name": "NotEndYet",
      "msg": "Not the redeem time yet"
    },
    {
      "code": 306,
      "name": "AlreadyEnd",
      "msg": "Contract already end"
    },
    {
      "code": 307,
      "name": "MathOverflow",
      "msg": "MathOverflow"
    }
  ]
};
