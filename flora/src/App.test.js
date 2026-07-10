import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the map app shell', () => {
  render(<App />);

  expect(screen.getByRole('main')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: /map/i })).toBeInTheDocument();
});
