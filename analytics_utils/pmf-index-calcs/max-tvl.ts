import { QueryTypes } from "sequelize";
import { sequelize } from "../../src/db/index.js";
import { initTVLModel } from "../../src/db/tvl.model.js";

/**
 * Initialize the TVL model in the database
 */
initTVLModel();

/**
 * Raw database result interface for TVL data
 * @interface MaxTVLResult
 * @property {string} user_id - Unique identifier for the user
 * @property {string} user_address - User's blockchain address
 * @property {number} max_combined_tvl - Maximum combined TVL value (hl_tvl + daily_tvl)
 * @property {string} date - Date when the maximum TVL was recorded
 */
interface MaxTVLResult {
  user_id: string;
  user_address: string;
  max_combined_tvl: number;
  date: string;
}

/**
 * Simplified interface for returning TVL data
 * @interface SimpleMaxTVL
 * @property {string} userId - Unique identifier for the user
 * @property {number} maxTVL - Maximum TVL value for the user
 */
interface SimpleMaxTVL {
  userId: string;
  maxTVL: number;
}

/**
 * Retrieves the maximum Total Value Locked (TVL) for all users
 *
 * This function queries the tvl_tracking table to find the highest combined TVL
 * (sum of hl_tvl and daily_tvl) for each user. The results are ordered by
 * maximum TVL in descending order.
 *
 * Note: TVL values from the database are divided by 1e6 to convert back to original values
 *
 * @returns {Promise<SimpleMaxTVL[]>} Array of objects containing userId and their maximum TVL
 * @throws {Error} If there's an error fetching data from the database
 */
async function getMaxTVLForUsers(): Promise<SimpleMaxTVL[]> {
  try {
    const query = `
      SELECT 
        user_id,
        user_address,
        COALESCE(hl_tvl, 0) + COALESCE(daily_tvl, 0) as max_combined_tvl,
        date
      FROM tvl_tracking t1
      WHERE (COALESCE(hl_tvl, 0) + COALESCE(daily_tvl, 0)) = (
        SELECT MAX(COALESCE(hl_tvl, 0) + COALESCE(daily_tvl, 0))
        FROM tvl_tracking t2
        WHERE t1.user_id = t2.user_id
      )
      ORDER BY max_combined_tvl DESC;
    `;

    const results = await sequelize.query<MaxTVLResult>(query, {
      type: QueryTypes.SELECT,
    });

    // Transform results into simplified format and divide TVL by 1e6
    return results.map((result) => ({
      userId: result.user_id,
      maxTVL: Number(result.max_combined_tvl) / 1_000_000,
    }));
  } catch (error) {
    console.error("Error fetching max TVL data:", error);
    throw error;
  }
}

export { getMaxTVLForUsers };
