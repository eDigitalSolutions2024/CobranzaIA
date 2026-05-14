import Sidebar from "../components/Sidebar"
import Topbar from "../components/Topbar"

type Props = {
  children: React.ReactNode
  page: string
  setPage: (page: string) => void
}

export default function MainLayout({
  children,
  page,
  setPage,
}: Props) {

  return (
    <div className="flex min-h-screen bg-zinc-950 text-white">

      <Sidebar
        page={page}
        setPage={setPage}
      />

      <div className="flex flex-1 flex-col">

        <Topbar />

        <main className="flex-1 p-6">
          {children}
        </main>

      </div>

    </div>
  )
}