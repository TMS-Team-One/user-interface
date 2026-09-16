import Layout from './Layout'

function Welcome(): React.JSX.Element {
  return (
    <Layout>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <h1 className="text-2xl font-semibold">ProbePilot</h1>
        <p className="text-sm text-muted-foreground">Add a new test case to get started.</p>
      </div>
    </Layout>
  )
}

export default Welcome
