import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import App from './App'

describe('App', () => {
  it('renders the monitor headline and companion name', async () => {
    render(<App />)

    expect(await screen.findByRole('heading', { name: /cc buddy/i })).toBeInTheDocument()
    expect(
      within(screen.getByLabelText(/session summary/i)).getByText(/siltpaw/i),
    ).toBeInTheDocument()
  })
})
