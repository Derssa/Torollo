import '../../../i18n';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ValidationToast from './ValidationToast';
import type { StepValidationResponse, ValidatorResult } from '../../../shared/types/roadmap';

const passResult: ValidatorResult = {
  index: 0,
  type: 'container_running',
  status: 'pass',
  message: 'The container "web" is running.',
};

const failResult: ValidatorResult = {
  index: 0,
  type: 'container_running',
  status: 'fail',
  message: 'No container named "web" exists in this project yet.',
  expected: 'a running container named "web"',
  observed: 'no container with that name',
};

const errorResult: ValidatorResult = {
  index: 1,
  type: 'table_exists',
  status: 'error',
  message: 'Something went wrong while talking to Docker.',
  errorCode: 'DOCKER_ERROR',
};

function buildResponse(results: ValidatorResult[]): StepValidationResponse {
  return {
    roadmapId: 'example-first-architecture',
    stepId: 'create-web-server',
    stepPassed: results.every(result => result.status === 'pass'),
    results,
    checkedAt: '2026-07-15T10:00:00.000Z',
  };
}

function renderToast(response: StepValidationResponse, { onDismiss = vi.fn() } = {}) {
  render(<ValidationToast response={response} onDismiss={onDismiss} />);
  return { onDismiss };
}

describe('ValidationToast', () => {
  it('shows the passed verdict with the first check message', () => {
    renderToast(buildResponse([passResult]));

    expect(screen.getByText('Validation passed')).toBeInTheDocument();
    expect(screen.getByText('The container "web" is running.')).toBeInTheDocument();
  });

  it('shows a failure as the verdict plus the first failing message only', () => {
    renderToast(buildResponse([failResult]));

    expect(screen.getByText('Not yet')).toBeInTheDocument();
    expect(
      screen.getByText('No container named "web" exists in this project yet.')
    ).toBeInTheDocument();
    // Expected/observed details stay in the sidebar's pedagogy, not the toast.
    expect(screen.queryByText(/a running container named/)).not.toBeInTheDocument();
    expect(screen.queryByText(/no container with that name/)).not.toBeInTheDocument();
  });

  it('skips the messages of checks that passed when the step failed', () => {
    renderToast(buildResponse([passResult, { ...failResult, index: 2 }]));

    expect(screen.queryByText('The container "web" is running.')).not.toBeInTheDocument();
    expect(
      screen.getByText('No container named "web" exists in this project yet.')
    ).toBeInTheDocument();
  });

  it('counts additional failing checks instead of listing them', () => {
    renderToast(
      buildResponse([
        failResult,
        { ...failResult, index: 1, message: 'The node is not named "db".' },
        { ...failResult, index: 2, message: 'The container is not running.' },
      ])
    );

    expect(
      screen.getByText('No container named "web" exists in this project yet.')
    ).toBeInTheDocument();
    expect(screen.queryByText('The node is not named "db".')).not.toBeInTheDocument();
    expect(screen.getByText('+2 more checks to fix')).toBeInTheDocument();
  });

  it('shows an infrastructure error distinctly, without the raw error code', () => {
    renderToast(buildResponse([errorResult]));

    expect(screen.getByText("Checks couldn't run")).toBeInTheDocument();
    expect(
      screen.getByText("Some checks couldn't run — that's on us, not you. Fix the issue or just try again.")
    ).toBeInTheDocument();
    expect(screen.queryByText('DOCKER_ERROR')).not.toBeInTheDocument();
  });

  it('lets an error win over a failure in the verdict', () => {
    renderToast(buildResponse([failResult, errorResult]));

    expect(screen.getByText("Checks couldn't run")).toBeInTheDocument();
    expect(screen.queryByText('Not yet')).not.toBeInTheDocument();
  });

  it('uses the Docker-specific wording when the daemon is unreachable', () => {
    renderToast(buildResponse([{ ...errorResult, errorCode: 'DOCKER_UNAVAILABLE' }]));

    expect(
      screen.getByText("Docker wasn't running, so the checks couldn't run. Start Docker and validate again.")
    ).toBeInTheDocument();
  });

  it('reports the dismissal through the close button', () => {
    const { onDismiss } = renderToast(buildResponse([passResult]));

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
