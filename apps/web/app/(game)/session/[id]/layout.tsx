export default function GameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="h-screen overflow-hidden bg-bg-base">{children}</div>;
}
