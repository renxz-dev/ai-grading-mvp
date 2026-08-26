import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../../src/App';

describe('application smoke test', () => {
  it('renders the MVP heading', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: 'AI 智能作业批改 MVP' }),
    ).toBeInTheDocument();
  });
});
