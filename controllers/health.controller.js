import { getDBStatus } from '../database/db.js';

export const checkHealth = async (req, res) => {
    // TODO: Implement health check functionality
    const dbStatus = await getDBStatus();
    const readyStateText = getReadyStateText(dbStatus.readyState);
    res.status(200).json({
        status: "success",
        data: {
            dbStatus: {
                readyState: dbStatus.readyState,
                readyStateText: readyStateText,
            },
        },
    });
};

function getReadyStateText(state) {
    switch (state) {
        case 0:
            return "Disconnected";
        case 1:
            return "Connected";
        case 2:
            return "Connecting";
        case 3:
            return "Disconnecting";
        default:
            return "Unknown";
    }
}
