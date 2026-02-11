'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { getSocket } from '@/lib/socket';

interface ModelCost {
  model: string;
  provider: string;
  callCount: number;
  totalTokens: number;
  estimatedCostUSD: number;
}

interface CostReport {
  sessionId: string;
  totalCalls: number;
  totalTokens: number;
  estimatedCostUSD: number;
  estimatedCostKRW: number;
  byModel: ModelCost[];
}

interface TokenCostPanelProps {
  sessionId: string;
}

export default function TokenCostPanel({ sessionId }: TokenCostPanelProps) {
  const [report, setReport] = useState<CostReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(() => {
    const socket = getSocket();
    if (!socket?.connected) {
      setError('소켓 연결이 없습니다');
      return;
    }

    setIsLoading(true);
    setError(null);
    socket.emit('session:costReport', { sessionId });
  }, [sessionId]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleResult = (payload: CostReport) => {
      if (payload.sessionId !== sessionId) return;
      setReport(payload);
      setIsLoading(false);
    };

    const handleError = (payload: { code: string; message: string }) => {
      setError(payload.message);
      setIsLoading(false);
    };

    socket.on('session:costReportResult', handleResult);
    socket.on('error', handleError);

    fetchReport();

    return () => {
      socket.off('session:costReportResult', handleResult);
      socket.off('error', handleError);
    };
  }, [sessionId, fetchReport]);

  const formatUSD = (value: number) => `$${value.toFixed(4)}`;
  const formatKRW = (value: number) => `${Math.round(value).toLocaleString()}원`;
  const formatTokens = (value: number) => value.toLocaleString();

  return (
    <div className="p-4 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-primary">세션 비용 요약</h3>
        <button
          onClick={fetchReport}
          disabled={isLoading}
          className="p-1.5 text-text-tertiary hover:text-text-secondary transition-colors disabled:opacity-50"
          title="새로고침"
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* 로딩 */}
      {isLoading && !report && (
        <div className="text-sm text-text-tertiary text-center py-8">비용 데이터 로딩 중...</div>
      )}

      {/* 에러 */}
      {error && (
        <div className="text-sm text-red-400 text-center py-4">{error}</div>
      )}

      {/* 데이터 없음 */}
      {!isLoading && !error && (!report || report.totalCalls === 0) && (
        <div className="text-sm text-text-tertiary text-center py-8">
          아직 토큰 사용 기록이 없습니다
        </div>
      )}

      {/* 요약 카드 */}
      {report && report.totalCalls > 0 && (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-2.5 bg-bg-elevated border border-line rounded">
              <span className="text-xs text-text-tertiary">총 호출 수</span>
              <span className="text-sm font-medium text-text-primary">
                {report.totalCalls}회
              </span>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-bg-elevated border border-line rounded">
              <span className="text-xs text-text-tertiary">총 토큰</span>
              <span className="text-sm font-medium text-text-primary">
                {formatTokens(report.totalTokens)}
              </span>
            </div>
            <div className="flex items-center justify-between p-2.5 bg-bg-elevated border border-line rounded">
              <span className="text-xs text-text-tertiary">예상 비용</span>
              <span className="text-sm font-medium text-gold">
                {formatUSD(report.estimatedCostUSD)}{' '}
                <span className="text-text-tertiary text-xs">
                  (≈{formatKRW(report.estimatedCostKRW)})
                </span>
              </span>
            </div>
          </div>

          {/* 모델별 상세 */}
          {report.byModel.length > 0 && (
            <div className="space-y-1">
              <h4 className="text-xs font-medium text-text-tertiary uppercase tracking-wider">
                모델별 상세
              </h4>
              <div className="space-y-1">
                {report.byModel.map((m) => (
                  <div
                    key={`${m.provider}-${m.model}`}
                    className="p-2.5 bg-bg-elevated border border-line rounded text-sm"
                  >
                    <div className="font-medium text-text-primary">
                      {m.model}{' '}
                      <span className="text-xs text-text-tertiary">({m.provider})</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-text-tertiary">
                      <span>{m.callCount}회</span>
                      <span>·</span>
                      <span>{formatTokens(m.totalTokens)} 토큰</span>
                      <span>·</span>
                      <span className="text-gold">{formatUSD(m.estimatedCostUSD)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
