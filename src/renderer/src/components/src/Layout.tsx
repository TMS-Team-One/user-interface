import { Separator } from '../ui/separator'
import { SidebarTrigger } from '../ui/sidebar'

interface LayoutProps {
  children: React.ReactNode
  title?: string
}

const Layout = ({ children, title }: LayoutProps) => {
  return (
    <>
      <div className="flex flex-row items-center gap-4">
        <SidebarTrigger />
        {title}
      </div>
      <Separator></Separator>
      {children}
    </>
  )
}

export default Layout
