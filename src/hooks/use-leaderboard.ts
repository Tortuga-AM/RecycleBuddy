import { supabase } from '@/lib/supabase';
import { useCallback, useEffect, useState } from 'react';

export type Period = 'week' | 'month' | 'all';

export interface LeaderboardRow {
  rank: number;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  total_weight: number;
  item_count: number;
}

export interface MyRank {
  rank: number;
  total_weight: number;
  item_count: number;
  total_participants: number;
  percentile: number;
}

export function useLeaderboard(period: Period) {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [myRank, setMyRank] = useState<MyRank | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [board, mine] = await Promise.all([
      supabase.rpc('get_leaderboard', { period }),
      supabase.rpc('get_my_rank', { period }),
    ]);

    if (board.error) {
      setError(board.error.message);
      setRows([]);
    } else {
      // PostgREST returns `numeric` as a STRING — coerce it.
      setRows(
        (board.data ?? []).map((r: any) => ({
          rank: Number(r.rank),
          user_id: r.user_id,
          display_name: r.display_name,
          avatar_url: r.avatar_url,
          total_weight: Number(r.total_weight),
          item_count: Number(r.item_count),
        }))
      );
    }

    if (!mine.error && mine.data?.[0]) {
      const m = mine.data[0];
      setMyRank({
        rank: Number(m.rank),
        total_weight: Number(m.total_weight),
        item_count: Number(m.item_count),
        total_participants: Number(m.total_participants),
        percentile: Number(m.percentile),
      });
    } else {
      setMyRank(null);
    }

    setLoading(false);
  }, [period]);

  useEffect(() => { load(); }, [load]);

  return { rows, myRank, loading, error, refresh: load };
}