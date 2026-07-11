import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import InputModal from './InputModal';

describe('InputModal', () => {
  it('renders title, label, placeholder, and buttons', () => {
    const handleSubmit = vi.fn();
    const handleCancel = vi.fn();

    render(
      <InputModal
        title="Create Project"
        label="Enter project name"
        placeholder="My Project"
        onSubmit={handleSubmit}
        onCancel={handleCancel}
      />
    );

    expect(screen.getByText('Create Project')).toBeInTheDocument();
    expect(screen.getByText('Enter project name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('My Project')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument();
  });

  it('updates input value on typing', () => {
    render(
      <InputModal
        title="Create Project"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'New Project Name' } });
    expect(input.value).toBe('New Project Name');
  });

  it('calls onSubmit when submitting a valid value', async () => {
    const handleSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <InputModal
        title="Create Project"
        onSubmit={handleSubmit}
        onCancel={vi.fn()}
      />
    );

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Torollo Project' } });

    const submitBtn = screen.getByRole('button', { name: /create/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith('Torollo Project');
    });
  });

  it('displays the inline error message when onSubmit fails, and clears it on typing', async () => {
    const handleSubmit = vi.fn().mockRejectedValue(new Error('Project already exists'));

    render(
      <InputModal
        title="Create Project"
        onSubmit={handleSubmit}
        onCancel={vi.fn()}
      />
    );

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Duplicate' } });

    const submitBtn = screen.getByRole('button', { name: /create/i });
    fireEvent.click(submitBtn);

    // Should display the error message
    await waitFor(() => {
      expect(screen.getByText('Project already exists')).toBeInTheDocument();
    });

    // Error styling should be applied
    expect(input).toHaveStyle('border-color: rgb(220, 38, 38)');

    // Type in the input to resolve the error
    fireEvent.change(input, { target: { value: 'Duplicate name but changing' } });

    // The error message should disappear
    expect(screen.queryByText('Project already exists')).not.toBeInTheDocument();
  });
});
