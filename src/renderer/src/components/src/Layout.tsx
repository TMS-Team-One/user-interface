import { Separator } from '../ui/separator'
import { SidebarTrigger } from '../ui/sidebar'

interface LayoutProps {
  children: React.ReactNode
  action?: React.ReactNode
  title?: React.ReactNode
}

const Layout = ({ children, action, title }: LayoutProps): React.JSX.Element => {
  return (
    <>
      <div className="flex flex-row items-center justify-between gap-4 w-full">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <SidebarTrigger />
          {title && <h1 className="truncate text-base font-medium text-foreground">{title}</h1>}
        </div>
        {action && <div className="flex shrink-0 justify-end">{action}</div>}
      </div>
      <Separator></Separator>
      {children}
    </>
  )
}

export default Layout
