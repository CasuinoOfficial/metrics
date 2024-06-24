import { SuiEvent } from '@mysten/sui.js/client';
import { PlayerHandResults, getCardSums, getPlayerHandResult } from './blackjackUtils';


type GameConfigurations = {
    [key: string]: {
      name: string,
      package_id: string,
      module_name: string,
      event_handler: (events: SuiEvent[], type: string) => any,
    }
  }
  export type Network = 'mainnet' | 'testnet' | 'devnet' | 'localnet';

  const network = (process.env.NETWORK || "testnet") as Network;
  
  type BlackjackPlayerHands = {
    bet_size: number;
    cards: Array<number>;
    status: string;
    current_sum: number;
    is_settled: boolean;
    is_doubled: boolean;
    is_natural_blackjack: boolean;
  };
  
  type BlackjackEvent = {
    bet_size: string;
    dealer_cards: number[];
    game_id: string;
    player: string;
    player_hands: BlackjackPlayerHands[];
    player_lost: string;
    player_won: string;
  };

/**
 * Returns the generic type
 * @param type packageID::moduleID::Event<T>
 * @returns the generic type <T>
 */
export const extractGenericTypes = (
	type: string
): string[] => {
	const x = type.split("<");
	return x.length > 1 ? x[1].replace(">", "").replace(" ", "").split(",") : [];
};

  async function handleBlackjackEvents(
    events: SuiEvent[],
    type: string,
  ): Promise<number> {
    const eventGameOutcome = "GameOutcome";
    let number = 0;
    events.forEach(event => {
        if (
          event.type.includes(`${type}::${eventGameOutcome}`) &&
          event.parsedJson && extractGenericTypes(event.type)[0] === "0x2::sui::SUI"
        ) {
          const data = event.parsedJson as BlackjackEvent;
    
          const dealerSum = getCardSums(data.dealer_cards)[0];
          let bet = 0;
          let payout = 0;
    
          for (const hand of data.player_hands) {
            const betSize = hand.bet_size
              ? Number(hand.bet_size)
              : Number(data.bet_size);
            bet += betSize;
    
            const result = getPlayerHandResult(
              dealerSum,
              hand.current_sum,
              hand.is_natural_blackjack,
            );
    
            if (result === PlayerHandResults.WIN) {
              if (hand.is_natural_blackjack) {
                payout += (betSize * 5) / 2; /* pays 3 to 2 */
              } else {
                payout += betSize * 2;
              }
            } else if (result === PlayerHandResults.PUSH) {
              payout += betSize;
            }
          }

          // The amount bet vs the amonut payed out.
          number += bet - payout;
        }
      });
      return number;
  }

  type WinCondition = {
    from: string;
    to: string;
  };
  
  type Settlement = {
    bet_size: string;
    payout_amount: string;
    player_won: boolean;
    win_condition: WinCondition[];
  };
  
  type SettlerEvent = {
    bet_id: string;
    outcome: string;
    player: string;
    settlements: Settlement[];
  };

  async function handleBlsEvents(
    events: SuiEvent[],
    type: string,
  ): Promise<number> {
    const eventName = "SettlementEvent";
    let number = 0;
    events
    .filter(
      v =>
        (v.type.includes(
          `${type}::${eventName}<0x2::sui::SUI`,
        )) && v.parsedJson,
    )
    .map((item: SuiEvent) => {
      const data = item.parsedJson as SettlerEvent;
      data.settlements.map((bet_result: Settlement) => {
        number += bet_result.player_won as boolean ? parseInt(bet_result.payout_amount) * -1 : parseInt(bet_result.bet_size)
      });
    });
    return number;
  }

  type LimboResult = {
    bet_returned: string;
    bet_size: string;
    outcome: string;
  };
  
  type LimboEvent = {
    player: string;
    results: LimboResult[];
  };

  async function handleLimboEvents(
    events: SuiEvent[],
    type: string,
  ): Promise<number> {
    let number = 0;

    events.filter(v => v.parsedJson && v.type.includes(
        `0x2::sui::SUI`,
      )).map((item: SuiEvent) => {
        const data = item.parsedJson as LimboEvent;
        data.results.map((bet_result: LimboResult) =>
            number += parseInt(bet_result.bet_size) - parseInt(bet_result.bet_returned)
        );
    })

    return number;
  }

  type PlinkoEvent = {
    ball_count: string;
    bet_size: string;
    challenged: boolean;
    game_id: string;
    game_type: number;
    player: string;
    pnl: string;
    results: {
      ball_index: string;
      ball_path: number[];
    };
  };

  async function handlePlinkoEvents(
    events: SuiEvent[],
    type: string,
  ): Promise<number> {
    let number = 0;
    const eventName = "Outcome";

    events.filter(v => v.type.includes(`${type}::${eventName}`) && v.parsedJson && v.type.includes(
        `0x2::sui::SUI`,
      )).map((item: SuiEvent) => {
        // console.log(item);
      const data = item.parsedJson as PlinkoEvent;
        number += parseInt(data.bet_size) * parseInt(data.ball_count) - parseInt(data.pnl)
    });

    return number;
  }

  type RouletteResult = {
    bet_id: string;
    is_win: boolean;
    bet_type: number;
    bet_number: string | undefined;
    bet_size: string;
    player: string;
  };
  
  type RouletteEvent = {
    game_round: string;
    game_id: string;
    result_roll: string;
    bet_results: RouletteResult[];
  };

  export function getBetTypeToOdds(
    betType: string
): number {
    switch (betType) {
        case "0": return 2;
        case "1": return 2;
        case "2": return 36;
        case "3": return 2;
        case "4": return 2;
        case "5": return 3;
        case "6": return 3;
        case "7": return 3;
        case "8": return 2;
        case "9": return 2;
        case "10": return 3;
        case "11": return 3;
        case "12": return 3;
        default: return 0;
    }
};

  async function handleRouletteEvents(
    events: SuiEvent[],
    type: string,
  ): Promise<number> {
    const eventName = "GameSettlement";
    let number = 0;
    events
    .filter(v => v.type.includes(`${type}::${eventName}`) && v.type.includes(
        `0x2::sui::SUI`) && v.parsedJson)
    .map((item: SuiEvent) => {
      const data = item.parsedJson as RouletteEvent;

      data.bet_results.map((bet_result: RouletteResult) =>
        number += bet_result.is_win
            ? parseInt(bet_result.bet_size) - (getBetTypeToOdds(bet_result.bet_type.toString()) * parseInt(bet_result.bet_size))
            : parseInt(bet_result.bet_size)
      );
    });
    return number;
  }

  export const game_config: GameConfigurations = {
    // blackjack: {
    //   "name": "blackjack",
    //   "package_id": "0xbdec0470a0b3c4a1cd3d2ac3b7eb10af57db23e2dffcdf001f1f04f6eb79e065",
    //   "module_name": "single_deck_blackjack",
    //   "event_handler": handleBlackjackEvents,
    // },
    // bls: {
    //   "name": "bls_settler",
    //   "package_id": "0xf0978635bb456d2cb2e594cd4a018c9aed486d6cb68c7890abe5ef56838034bf",
    //   "module_name": "bls_settler",
    //   "event_handler": handleBlsEvents,
    // },
    // limbo: {
    //   "name": "limbo",
    //   "package_id": "0xbca3313d753bba2e3b3d911d2306c5024de99dfdb2fc456850186b18867ac36c",
    //   "module_name": "limbo",
    //   "event_handler": handleLimboEvents,
    // },
    plinko: {
      "name": "plinko",
      "package_id": "0x1513ee1a47bb1e3b78162f42510f3eece3c6ab0b246bdafda47f939cf7a81c07",
      "module_name": "plinko",
      "event_handler": handlePlinkoEvents,
    },
    // roulette: {
    //   "name": "roulette",
    //   "package_id": "0x97edb657c1fc47e02b1c6603fcdf82974b149f6b9bb8e3ade69c6ec94f3003f1",
    //   "module_name": "roulette_events",
    //   "event_handler": handleRouletteEvents,
    // },
  };
  