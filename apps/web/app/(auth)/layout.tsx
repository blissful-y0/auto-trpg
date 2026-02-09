export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-amber-400 text-shadow">
            Auto TRPG
          </h1>
          <p className="text-slate-400 mt-2">AI 게임 마스터와 함께하는 모험</p>
        </div>
        <div className="card p-8 fantasy-border">{children}</div>
      </div>
    </div>
  );
}
