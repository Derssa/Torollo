import '../../../i18n';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StepValidationResults from './StepValidationResults';
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

function renderResults(
  response: StepValidationResponse,
  { isLastStep = false, onNextStep = vi.fn() } = {}
) {
  render(<StepValidationResults response={response} isLastStep={isLastStep} onNextStep={onNextStep} />);
  return { onNextStep };
}

describe('StepValidationResults', () => {
  it('renders the success banner with a Next step button that advances', () => {
    const { onNextStep } = renderResults(buildResponse([passResult]));

    expect(screen.getByText('Step passed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    expect(onNextStep).toHaveBeenCalledOnce();
  });

  it('celebrates the roadmap on the last step and offers no Next step button', () => {
    renderResults(buildResponse([passResult]), { isLastStep: true });

    expect(
      screen.getByText('Step passed — that was the last one. Roadmap complete!')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next step' })).not.toBeInTheDocument();
  });

  it('renders a pedagogical failure: banner, message, expected and observed', () => {
    renderResults(buildResponse([failResult]));

    expect(screen.getByText('Not yet — see the results below')).toBeInTheDocument();
    expect(
      screen.getByText('No container named "web" exists in this project yet.')
    ).toBeInTheDocument();
    expect(screen.getByText('a running container named "web"')).toBeInTheDocument();
    expect(screen.getByText('no container with that name')).toBeInTheDocument();
  });

  it('renders an infrastructure error distinctly, without the raw error code', () => {
    renderResults(buildResponse([errorResult]));

    expect(
      screen.getByText("Some checks couldn't run — that's on us, not you. Fix the issue below or just try again.")
    ).toBeInTheDocument();
    expect(screen.getByText("Check couldn't run")).toBeInTheDocument();
    expect(screen.queryByText('DOCKER_ERROR')).not.toBeInTheDocument();
  });

  it('lets an error win over a failure in the banner while still listing the failure', () => {
    renderResults(buildResponse([failResult, errorResult]));

    expect(
      screen.getByText("Some checks couldn't run — that's on us, not you. Fix the issue below or just try again.")
    ).toBeInTheDocument();
    expect(screen.queryByText('Not yet — see the results below')).not.toBeInTheDocument();
    expect(
      screen.getByText('No container named "web" exists in this project yet.')
    ).toBeInTheDocument();
  });

  it('uses the Docker-specific wording when the daemon is unreachable', () => {
    renderResults(
      buildResponse([{ ...errorResult, errorCode: 'DOCKER_UNAVAILABLE' }])
    );

    expect(
      screen.getByText("Docker isn't running, so the checks couldn't run. Start Docker and validate again.")
    ).toBeInTheDocument();
  });
});
