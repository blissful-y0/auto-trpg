export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-bg-base p-4">
      <div className="w-full max-w-[400px] animate-fade-in">
        <div className="text-center mb-8">
          <h1 className="font-serif text-display text-gold text-shadow">
            Auto TRPG
          </h1>
          <p className="text-text-secondary text-body-sm mt-2">
            AI 게임 마스터와 함께하는 모험
          </p>
        </div>
        <div className="card p-8 shadow-lg">{children}</div>
        <p className="text-center text-caption text-text-tertiary mt-6">
          Powered by AI
        </p>
      </div>
    </div>
  );
}
