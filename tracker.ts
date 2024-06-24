import { SuiClient, SuiEventFilter, SuiEvent, getFullnodeUrl, PaginatedEvents, EventId} from '@mysten/sui.js/client';
import { game_config } from './game-config';
const suiClient =  new SuiClient({ url: getFullnodeUrl("mainnet") });

export type EventTracker = {
    // The module that defines the type, with format `package::module`
    type: string;
    filter: SuiEventFilter;
    callback: (events: SuiEvent[], type: string) => any;
};

export const network_config = {
    POLLING_INTERVAL_MS: 1000,
    DEFAULT_LIMIT: 50,
    NETWORK: 'mainnet',
};

export const EVENTS_TO_TRACK: EventTracker[] = Object.keys(game_config).map((key) => {
    return {
        type: `${game_config[key].package_id}::${game_config[key].module_name}`,
        filter: {
            MoveEventModule: {
                module: game_config[key].module_name,
                package: game_config[key].package_id,
            }
        },
        callback: game_config[key].event_handler,
    }
});

type SuiEventsCursor = EventId | null | undefined;

type EventExecutionResult = {
    cursor: SuiEventsCursor;
    hasNextPage: boolean;
};

/**
 * Queries for the tracker events
 * and saves the latest cursor
 * @param client the SUI sdk client
 * @param tracker 
 * @param cursor the latest event seen
 * @returns 
 */
const queryEvents = async (
    client: SuiClient,
    tracker: EventTracker,
    cursor: SuiEventsCursor
): Promise<EventExecutionResult> => {
    try {
        let {
            data,
            hasNextPage,
            nextCursor
        }: PaginatedEvents = await client.queryEvents({
            query: tracker.filter,
            cursor: cursor,
            order: 'ascending',
            limit: network_config.DEFAULT_LIMIT,
        });
        let current_count = 0;
        // execute the event handler callback functions on the event data
        current_count += await tracker.callback(data, tracker.type);

        // loop through this until we get a total count
        while (nextCursor && data.length > 0 && hasNextPage) {
            let result = await client.queryEvents({
                query: tracker.filter,
                cursor: nextCursor,
                order: 'ascending',
                limit: network_config.DEFAULT_LIMIT,
            });
            data = result.data;
            hasNextPage = result.hasNextPage;
            nextCursor = result.nextCursor;
            current_count += await tracker.callback(data, tracker.type);
            console.log(current_count, hasNextPage, nextCursor);
        }
    } catch (e) {
        console.error(`Got an error for tracker: ${tracker.type} with filter ${JSON.stringify(tracker.callback)}: ${e}`);
    }
    return {
        // Note: returns the same cursor when there is no new data
        cursor: cursor,
        hasNextPage: false,
    }
};

/**
 * The job that continuously queries for available new events
 * @param client 
 * @param tracker 
 * @param cursor 
 */
const startPollingJob = async (
    client: SuiClient,
    tracker: EventTracker,
    cursor: SuiEventsCursor
) => {
    const result = await queryEvents(client, tracker, cursor);
    setTimeout(() => {
        // continue to poll the next page after cursor
        startPollingJob(client, tracker, result.cursor);
    }, result.hasNextPage ? 0 : network_config.POLLING_INTERVAL_MS);
};

/**
 * The handler function that creates the polling jobs
 */
export const createPollJobs = async () => {
    for (const event of EVENTS_TO_TRACK) {
        // Note you can just use this to track it with cursor if you guys store it in database
        startPollingJob(new SuiClient({ url: getFullnodeUrl("mainnet") }), event, null);
    }
};

createPollJobs();