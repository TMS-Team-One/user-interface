import { Separator } from '../ui/separator'
import { SidebarTrigger } from '../ui/sidebar'

interface LayoutProps {
  children: React.ReactNode
  action?: React.ReactNode
  title?: string
}

const Layout = ({ children, action, title }: LayoutProps) => {
  return (
    <>
      <div className="flex flex-row items-center justify-start gap-4 w-full">
        <SidebarTrigger />
        {title}
        <div className="w-full flex justify-end">{action}</div>
      </div>
      <Separator></Separator>
      {children}
    </>
  )
}

export default Layout
