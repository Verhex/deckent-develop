import { useState, useEffect, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "./ui/button.js";

interface RefreshButtonProps {
  onRefetch: () => void;
  cooldownMs?: number;
  className?: string;
}

/**
 * Manual refresh button with cooldown — prevents hammering the server.
 * Pressing triggers `onRefetch` then disables the button for `cooldownMs`
 * (default 10s), showing a live countdown so the user knows when they can
 * refresh again.
 */
export function RefreshButton({
  onRefetch,
  cooldownMs = 10000,
  className,
}: RefreshButtonProps) {
  const [cooldown, setCooldown] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (!cooldown) return;
    const totalSeconds = Math.ceil(cooldownMs / 1000);
    setCountdown(totalSeconds);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setCooldown(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown, cooldownMs]);

  const handleRefresh = useCallback(() => {
    onRefetch();
    setCooldown(true);
  }, [onRefetch]);

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={cooldown}
      onClick={handleRefresh}
      className={className}
      data-testid="refresh-button"
      aria-label={cooldown ? `Refresh available in ${countdown}s` : "Refresh"}
    >
      <RefreshCw className="mr-1 h-3 w-3" />
      {cooldown ? `Refresh (${countdown}s)` : "Refresh"}
    </Button>
  );
}
