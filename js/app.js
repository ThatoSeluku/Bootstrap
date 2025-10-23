(function () {
  const defaultWeights = { psychometric: 20, technical: 40, final: 40 };
  const state = {
    candidate: null,
    stages: {
      psychometric: { scores: {}, comments: {}, average: null },
      technical: { scores: {}, comments: {}, average: null },
      final: {
        scores: {},
        comments: {},
        average: null,
        salaryRange: '',
        noticePeriod: '',
        finalComments: ''
      }
    },
    weights: loadWeights()
  };

  let chartInstance = null;

  const screenMap = {
    candidate: document.getElementById('screen-candidate'),
    psychometric: document.getElementById('screen-psychometric'),
    technical: document.getElementById('screen-technical'),
    final: document.getElementById('screen-final'),
    confidence: document.getElementById('screen-confidence'),
    weights: document.getElementById('screen-weights')
  };

  const statusIndicators = {
    psychometric: document.getElementById('status-psychometric'),
    technical: document.getElementById('status-technical'),
    final: document.getElementById('status-final')
  };

  const candidateBadge = document.getElementById('candidateStatusBadge');
  const weightsPreview = document.querySelectorAll('#weightsPreview [data-weight]');
  const stageNavButtons = document.querySelectorAll('[data-target]');
  const alertEl = document.getElementById('globalAlert');

  document.getElementById('candidateForm').addEventListener('submit', handleCandidateSubmit);
  document.getElementById('psychometricForm').addEventListener('submit', handleStageSubmit('psychometric'));
  document.getElementById('technicalForm').addEventListener('submit', handleStageSubmit('technical'));
  document.getElementById('finalForm').addEventListener('submit', handleFinalSubmit);
  document.getElementById('weightsForm').addEventListener('submit', handleWeightsSubmit);

  stageNavButtons.forEach(button => {
    button.addEventListener('click', () => {
      const target = button.getAttribute('data-target');
      if (target === 'weights') {
        populateWeightForm();
        showScreen('weights');
        return;
      }

      if (!canAccessScreen(target)) {
        showAlert('Save the previous stage before proceeding.', 'warning');
        return;
      }
      showScreen(target);
    });
  });

  updateWeightsUI();
  populateWeightForm();

  function handleCandidateSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const data = {
      firstName: form.firstName.value.trim(),
      lastName: form.lastName.value.trim(),
      email: form.email.value.trim(),
      phone: form.phone.value.trim()
    };

    if (!data.firstName || !data.lastName || !data.email || !data.phone) {
      showAlert('Please complete all required candidate details.', 'danger');
      return;
    }

    state.candidate = data;
    updateCandidateBadge();
    updateCandidateSummaries();
    showAlert('Candidate information saved.', 'success');
    showScreen('psychometric');
  }

  function handleStageSubmit(stageKey) {
    return function (event) {
      event.preventDefault();
      const form = event.target;
      const scoreInputs = form.querySelectorAll('[data-criterion]');
      const scores = {};
      const comments = {};
      let total = 0;

      for (const input of scoreInputs) {
        const value = parseInt(input.value, 10);
        if (!value) {
          showAlert('Please score every criterion before saving.', 'danger');
          return;
        }
        const criterion = input.getAttribute('data-criterion');
        scores[criterion] = value;
        total += value;
        const commentField = form.querySelector(`[name="${criterion}-comment"]`);
        comments[criterion] = commentField ? commentField.value.trim() : '';
      }

      const average = parseFloat((total / scoreInputs.length).toFixed(2));
      state.stages[stageKey].scores = scores;
      state.stages[stageKey].comments = comments;
      state.stages[stageKey].average = average;

      markStageComplete(stageKey);
      updateConfidenceAvailability();
      updateCandidateSummaries();

      showAlert('Stage saved successfully.', 'success');
      showScreen(nextStage(stageKey));
    };
  }

  function handleFinalSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const submitStage = handleStageSubmit('final');
    submitStage(event);

    if (state.stages.final.average === null) {
      return;
    }

    state.stages.final.salaryRange = form.salaryRange.value.trim();
    state.stages.final.noticePeriod = form.noticePeriod.value;
    state.stages.final.finalComments = form.finalComments.value.trim();

    updateConfidenceAvailability();
    showScreen('confidence');
  }

  function handleWeightsSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const newWeights = {
      psychometric: Number(form.weightPsychometric.value),
      technical: Number(form.weightTechnical.value),
      final: Number(form.weightFinal.value)
    };

    const total = newWeights.psychometric + newWeights.technical + newWeights.final;
    if (Number.isNaN(total) || total !== 100) {
      showAlert('Weights must be numeric and total 100%.', 'danger');
      return;
    }

    state.weights = newWeights;
    localStorage.setItem('candidateWeights', JSON.stringify(newWeights));
    updateWeightsUI();
    updateConfidenceAvailability();
    showAlert('Weights updated.', 'success');
    showScreen('candidate');
  }

  function loadWeights() {
    try {
      const stored = localStorage.getItem('candidateWeights');
      if (!stored) return { ...defaultWeights };
      const parsed = JSON.parse(stored);
      const total = parsed.psychometric + parsed.technical + parsed.final;
      if (total !== 100) throw new Error('Invalid weight total.');
      return parsed;
    } catch (error) {
      console.warn('Unable to load stored weights. Resetting to defaults.', error);
      localStorage.removeItem('candidateWeights');
      return { ...defaultWeights };
    }
  }

  function updateCandidateBadge() {
    if (!state.candidate) {
      candidateBadge.textContent = 'No candidate loaded';
      candidateBadge.classList.remove('badge-success');
      candidateBadge.classList.add('badge-light', 'text-primary');
      return;
    }

    candidateBadge.textContent = `${state.candidate.firstName} ${state.candidate.lastName}`;
    candidateBadge.classList.remove('badge-light', 'text-primary');
    candidateBadge.classList.add('badge-success', 'text-white');
  }

  function updateCandidateSummaries() {
    const summaries = {
      psychometric: document.getElementById('candidateSummaryPsychometric'),
      technical: document.getElementById('candidateSummaryTechnical'),
      final: document.getElementById('candidateSummaryFinal'),
      confidence: document.getElementById('candidateSummaryConfidence')
    };

    Object.values(summaries).forEach(container => {
      if (!container) return;
      container.innerHTML = buildCandidateSummary();
    });
  }

  function buildCandidateSummary() {
    if (!state.candidate) {
      return '<div class="text-muted">Candidate details not yet saved.</div>';
    }

    const { firstName, lastName, email, phone } = state.candidate;
    return [
      summaryItem('Candidate', `${firstName} ${lastName}`),
      summaryItem('Email', email),
      summaryItem('Phone', phone)
    ].join('');
  }

  function summaryItem(label, value) {
    return `
      <div class="summary-item">
        <span>${label}</span>
        <strong>${value || '—'}</strong>
      </div>
    `;
  }

  function showAlert(message, type = 'info') {
    alertEl.classList.remove('alert-success', 'alert-danger', 'alert-warning', 'alert-info', 'show');
    alertEl.classList.add(`alert-${type}`, 'show');
    alertEl.querySelector('.alert-message').textContent = message;
    $(alertEl).addClass('show');
    setTimeout(() => {
      $(alertEl).removeClass('show');
    }, 3500);
  }

  function markStageComplete(stageKey) {
    const indicator = statusIndicators[stageKey];
    if (indicator) {
      indicator.classList.add('completed');
    }
  }

  function nextStage(stageKey) {
    const order = ['psychometric', 'technical', 'final'];
    const idx = order.indexOf(stageKey);
    if (idx === -1 || idx === order.length - 1) {
      return 'confidence';
    }
    return order[idx + 1];
  }

  function canAccessScreen(target) {
    if (target === 'candidate' || target === 'weights') return true;
    if (target === 'psychometric') return Boolean(state.candidate);
    if (target === 'technical') return state.stages.psychometric.average !== null;
    if (target === 'final') return state.stages.technical.average !== null;
    if (target === 'confidence') return state.stages.final.average !== null;
    return false;
  }

  function showScreen(target) {
    Object.keys(screenMap).forEach(key => {
      screenMap[key].classList.remove('active');
    });
    screenMap[target].classList.add('active');

    stageNavButtons.forEach(button => {
      button.classList.toggle('active', button.getAttribute('data-target') === target);
    });

    if (target === 'confidence') {
      updateConfidenceView();
    }
  }

  function updateConfidenceAvailability() {
    const ready = state.stages.final.average !== null;
    const content = document.getElementById('confidenceContent');
    const placeholder = document.getElementById('confidencePlaceholder');
    if (ready) {
      content.classList.remove('d-none');
      placeholder.classList.add('d-none');
    } else {
      content.classList.add('d-none');
      placeholder.classList.remove('d-none');
    }
  }

  function updateWeightsUI() {
    weightsPreview.forEach(span => {
      const key = span.getAttribute('data-weight');
      span.textContent = `${state.weights[key]}%`;
    });
  }

  function populateWeightForm() {
    const form = document.getElementById('weightsForm');
    form.weightPsychometric.value = state.weights.psychometric;
    form.weightTechnical.value = state.weights.technical;
    form.weightFinal.value = state.weights.final;
  }

  function updateConfidenceView() {
    if (!state.candidate || state.stages.final.average === null) {
      return;
    }

    const stageBreakdown = [
      {
        key: 'psychometric',
        label: 'Psychometric',
        average: state.stages.psychometric.average,
        comments: state.stages.psychometric.comments
      },
      {
        key: 'technical',
        label: 'Technical',
        average: state.stages.technical.average,
        comments: state.stages.technical.comments
      },
      {
        key: 'final',
        label: 'Final Interview',
        average: state.stages.final.average,
        comments: state.stages.final.comments
      }
    ];

    const details = document.getElementById('confidenceDetails');
    const feedbackSummary = document.getElementById('feedbackSummary');

    details.innerHTML = '';
    feedbackSummary.innerHTML = '';

    let finalScore = 0;

    stageBreakdown.forEach(stage => {
      const normalized = (stage.average / 5) * 100;
      const contribution = parseFloat(((normalized * state.weights[stage.key]) / 100).toFixed(2));
      finalScore += contribution;

      const listItem = document.createElement('li');
      listItem.className = 'list-group-item d-flex justify-content-between align-items-center';
      listItem.innerHTML = `
        <div>
          <div class="stage-label">${stage.label}</div>
          <small class="text-muted">Average: ${stage.average.toFixed(2)} / 5</small>
        </div>
        <span class="badge badge-primary badge-pill">${contribution.toFixed(1)} pts</span>
      `;
      details.appendChild(listItem);

      const feedbackCard = document.createElement('div');
      feedbackCard.className = 'feedback-card';
      const commentParts = Object.values(stage.comments).filter(Boolean);
      if (stage.key === 'final') {
        if (state.stages.final.salaryRange) {
          commentParts.push(`Expected Salary: ${state.stages.final.salaryRange}`);
        }
        if (state.stages.final.noticePeriod) {
          commentParts.push(`Notice Period: ${state.stages.final.noticePeriod}`);
        }
        if (state.stages.final.finalComments) {
          commentParts.push(state.stages.final.finalComments);
        }
      }
      const comments = commentParts.join(' \u2022 ');
      feedbackCard.innerHTML = `
        <h6>${stage.label}</h6>
        <p>${comments || 'No comments captured for this stage.'}</p>
      `;
      feedbackSummary.appendChild(feedbackCard);
    });

    const finalScoreRounded = Math.round(finalScore);
    document.getElementById('finalScoreValue').textContent = `${finalScoreRounded}%`;
    document.getElementById('recommendationTag').textContent = recommendation(finalScoreRounded);

    renderChart(stageBreakdown.map(stage => stage.label), stageBreakdown.map(stage => stage.average));
  }

  function recommendation(score) {
    if (score >= 85) return 'Highly Recommend';
    if (score >= 70) return 'Recommend';
    if (score >= 55) return 'Borderline';
    return 'Not Recommended';
  }

  function renderChart(labels, averages) {
    const ctx = document.getElementById('scoreChart').getContext('2d');
    if (chartInstance) {
      chartInstance.destroy();
    }
    chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Average Stage Score',
          data: averages.map(avg => parseFloat(avg.toFixed(2))),
          backgroundColor: ['#1f7aed', '#2ec4b6', '#ff9f1c']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            max: 5,
            ticks: {
              stepSize: 1
            }
          }
        },
        plugins: {
          legend: {
            display: false
          }
        }
      }
    });
  }
})();
