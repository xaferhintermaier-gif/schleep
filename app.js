// ============================================================================
// SLEEP SYSTEM - PRODUCTION IMPLEMENTATION
// ============================================================================

class SleepSystem {
    constructor() {
        this.currentEntry = this.getEmptyEntry();
        this.init();
    }

    init() {
        // Set today's date
        document.getElementById('entryDate').valueAsDate = new Date();
        
        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // Update sleep info on time change
        document.getElementById('bedtime').addEventListener('change', () => this.updateSleepInfo());
        document.getElementById('waketime').addEventListener('change', () => this.updateSleepInfo());

        // Load header stats
        this.updateHeaderStats();
        
        // Load data summary
        this.updateDataSummary();
    }

    getEmptyEntry() {
        return {
            date: '',
            bedtime: '',
            waketime: '',
            sleepDuration: 0,
            sleepDebt: 0,
            caffeine: [],
            alcohol: [],
            meals: [],
            exercise: [],
            screens: [],
            environment: {
                temp: 68,
                light: 0,
                noise: 30,
                bedroomOnly: true
            },
            violations: [],
            qualityScore: 0,
            breakdown: {}
        };
    }

    switchTab(tabName) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(tabName).classList.add('active');

        if (tabName === 'weekly') {
            this.generateWeeklyReport();
        }
    }

    // ========================================================================
    // DATA MANAGEMENT
    // ========================================================================

    saveEntry(entry) {
        const data = this.getAllData();
        const existingIndex = data.findIndex(e => e.date === entry.date);
        
        if (existingIndex >= 0) {
            data[existingIndex] = entry;
        } else {
            data.push(entry);
        }
        
        // Sort by date
        data.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        localStorage.setItem('sleepSystemData', JSON.stringify(data));
    }

    getAllData() {
        const data = localStorage.getItem('sleepSystemData');
        return data ? JSON.parse(data) : [];
    }

    getEntryByDate(date) {
        const data = this.getAllData();
        return data.find(e => e.date === date);
    }

    // ========================================================================
    // SLEEP CALCULATOR
    // ========================================================================

    calculateSleepDuration(bedtime, waketime) {
        const [bedHour, bedMin] = bedtime.split(':').map(Number);
        const [wakeHour, wakeMin] = waketime.split(':').map(Number);
        
        let bedMinutes = bedHour * 60 + bedMin;
        let wakeMinutes = wakeHour * 60 + wakeMin;
        
        // If wake time is earlier in the day, it's next day
        if (wakeMinutes < bedMinutes) {
            wakeMinutes += 24 * 60;
        }
        
        return wakeMinutes - bedMinutes;
    }

    calculateSleepDebt(duration) {
        const optimal = 480; // 8 hours in minutes
        const debt = optimal - duration;
        return Math.max(0, debt);
    }

    getCumulativeSleepDebt() {
        const data = this.getAllData();
        return data.reduce((sum, entry) => sum + (entry.sleepDebt || 0), 0);
    }

    updateSleepInfo() {
        const bedtime = document.getElementById('bedtime').value;
        const waketime = document.getElementById('waketime').value;
        
        if (bedtime && waketime) {
            const duration = this.calculateSleepDuration(bedtime, waketime);
            const hours = Math.floor(duration / 60);
            const minutes = duration % 60;
            const debt = this.calculateSleepDebt(duration);
            const debtHours = Math.floor(debt / 60);
            const debtMinutes = debt % 60;
            
            const info = document.getElementById('sleepInfo');
            info.innerHTML = `
                Sleep Duration: ${hours}h ${minutes}m<br>
                Sleep Debt: ${debtHours}h ${debtMinutes}m
            `;
        }
    }

    // ========================================================================
    // CIRCADIAN ENGINE
    // ========================================================================

    calculateCircadianAlignment(bedtime, waketime, date) {
        const targetBedtime = '22:30'; // 10:30 PM optimal
        const targetWaketime = '06:30'; // 6:30 AM optimal
        
        const bedDeviation = this.getTimeDeviation(bedtime, targetBedtime);
        const wakeDeviation = this.getTimeDeviation(waketime, targetWaketime);
        
        let penalty = 0;
        
        if (bedDeviation > 90) {
            penalty += (bedDeviation - 90) * 0.3;
        }
        
        if (wakeDeviation > 90) {
            penalty += (wakeDeviation - 90) * 0.2;
        }
        
        return { penalty, bedDeviation, wakeDeviation };
    }

    getTimeDeviation(actual, target) {
        const [actualHour, actualMin] = actual.split(':').map(Number);
        const [targetHour, targetMin] = target.split(':').map(Number);
        
        const actualMinutes = actualHour * 60 + actualMin;
        const targetMinutes = targetHour * 60 + targetMin;
        
        let diff = Math.abs(actualMinutes - targetMinutes);
        
        // Handle midnight wrap
        if (diff > 720) {
            diff = 1440 - diff;
        }
        
        return diff;
    }

    calculateSocialJetlag() {
        const data = this.getAllData().slice(-7); // Last 7 days
        if (data.length < 7) return 0;
        
        const weekdays = data.slice(0, 5);
        const weekends = data.slice(5, 7);
        
        if (weekdays.length === 0 || weekends.length === 0) return 0;
        
        const avgWeekdayWake = this.getAverageTime(weekdays.map(d => d.waketime));
        const avgWeekendWake = this.getAverageTime(weekends.map(d => d.waketime));
        
        return this.getTimeDeviation(avgWeekdayWake, avgWeekendWake);
    }

    getAverageTime(times) {
        const totalMinutes = times.reduce((sum, time) => {
            const [h, m] = time.split(':').map(Number);
            return sum + (h * 60 + m);
        }, 0);
        
        const avgMinutes = Math.round(totalMinutes / times.length);
        const hours = Math.floor(avgMinutes / 60);
        const minutes = avgMinutes % 60;
        
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }

    // ========================================================================
    // CAFFEINE TRACKER
    // ========================================================================

    calculateCaffeinePenalty(caffeineEntries, bedtime) {
        if (caffeineEntries.length === 0) return { penalty: 0, remaining: 0 };
        
        const halfLife = 5; // hours
        let totalRemaining = 0;
        
        const [bedHour, bedMin] = bedtime.split(':').map(Number);
        const bedtimeMinutes = bedHour * 60 + bedMin;
        
        caffeineEntries.forEach(entry => {
            const [entryHour, entryMin] = entry.time.split(':').map(Number);
            let entryMinutes = entryHour * 60 + entryMin;
            
            // Calculate hours before bedtime
            let hoursBefore;
            if (entryMinutes > bedtimeMinutes) {
                // Entry is after midnight but before bedtime
                hoursBefore = (bedtimeMinutes + 1440 - entryMinutes) / 60;
            } else {
                hoursBefore = (bedtimeMinutes - entryMinutes) / 60;
            }
            
            // Caffeine decay: remaining = initial * 0.5^(time/halfLife)
            const remaining = entry.mg * Math.pow(0.5, hoursBefore / halfLife);
            totalRemaining += remaining;
        });
        
        // Penalty calculation: 0.15 per mg remaining
        const penalty = totalRemaining * 0.15;
        
        return { penalty, remaining: totalRemaining };
    }

    // ========================================================================
    // ALCOHOL TRACKER
    // ========================================================================

    calculateAlcoholPenalty(alcoholEntries, bedtime) {
        if (alcoholEntries.length === 0) return { penalty: 0, fragmentationPenalty: 0 };
        
        const metabolicRate = 0.015; // BAC per hour
        let totalBAC = 0;
        let totalUnits = 0;
        
        const [bedHour, bedMin] = bedtime.split(':').map(Number);
        const bedtimeMinutes = bedHour * 60 + bedMin;
        
        alcoholEntries.forEach(entry => {
            const [entryHour, entryMin] = entry.time.split(':').map(Number);
            let entryMinutes = entryHour * 60 + entryMin;
            
            let hoursBefore;
            if (entryMinutes > bedtimeMinutes) {
                hoursBefore = (bedtimeMinutes + 1440 - entryMinutes) / 60;
            } else {
                hoursBefore = (bedtimeMinutes - entryMinutes) / 60;
            }
            
            // Convert units to BAC (rough estimate)
            const initialBAC = entry.units * 0.02;
            const remainingBAC = Math.max(0, initialBAC - (metabolicRate * hoursBefore));
            
            totalBAC += remainingBAC;
            totalUnits += entry.units;
        });
        
        // Fragmentation penalty: 8 points per unit
        const fragmentationPenalty = totalUnits * 8;
        
        // BAC penalty
        const bacPenalty = totalBAC * 100;
        
        return { 
            penalty: bacPenalty + fragmentationPenalty, 
            fragmentationPenalty,
            remainingBAC: totalBAC
        };
    }

    // ========================================================================
    // EXERCISE ENGINE
    // ========================================================================

    calculateExercisePenalty(exerciseEntries, bedtime) {
        if (exerciseEntries.length === 0) return { penalty: 0 };
        
        const [bedHour, bedMin] = bedtime.split(':').map(Number);
        const bedtimeMinutes = bedHour * 60 + bedMin;
        
        let totalPenalty = 0;
        
        exerciseEntries.forEach(entry => {
            const [entryHour, entryMin] = entry.time.split(':').map(Number);
            let entryMinutes = entryHour * 60 + entryMin;
            
            let hoursBefore;
            if (entryMinutes > bedtimeMinutes) {
                hoursBefore = (bedtimeMinutes + 1440 - entryMinutes) / 60;
            } else {
                hoursBefore = (bedtimeMinutes - entryMinutes) / 60;
            }
            
            let penalty = 0;
            
            // High intensity within 3 hours
            if (entry.intensity === 'high' && hoursBefore < 3) {
                penalty += (3 - hoursBefore) * 10;
            }
            
            // Cardio within 2 hours
            if (entry.type === 'cardio' && hoursBefore < 2) {
                penalty += 15;
            }
            
            // Medium intensity within 2 hours
            if (entry.intensity === 'medium' && hoursBefore < 2) {
                penalty += (2 - hoursBefore) * 5;
            }
            
            totalPenalty += penalty;
        });
        
        return { penalty: totalPenalty };
    }

    // ========================================================================
    // SCREEN ENGINE
    // ========================================================================

    calculateScreenPenalty(screenEntries, bedtime) {
        if (screenEntries.length === 0) return { penalty: 0 };
        
        const [bedHour, bedMin] = bedtime.split(':').map(Number);
        const bedtimeMinutes = bedHour * 60 + bedMin;
        
        let totalPenalty = 0;
        
        screenEntries.forEach(entry => {
            const [endHour, endMin] = entry.endTime.split(':').map(Number);
            let endMinutes = endHour * 60 + endMin;
            
            let hoursBefore;
            if (endMinutes > bedtimeMinutes) {
                hoursBefore = (bedtimeMinutes + 1440 - endMinutes) / 60;
            } else {
                hoursBefore = (bedtimeMinutes - endMinutes) / 60;
            }
            
            let penalty = 0;
            
            // Blue light within 2 hours
            if (hoursBefore < 2) {
                penalty += 20;
            }
            
            // Active content within 1 hour
            if (entry.contentType === 'active' && hoursBefore < 1) {
                penalty += 30;
            }
            
            // Moderate content within 1 hour
            if (entry.contentType === 'moderate' && hoursBefore < 1) {
                penalty += 15;
            }
            
            totalPenalty += penalty;
        });
        
        return { penalty: totalPenalty };
    }

    // ========================================================================
    // MEAL ENGINE
    // ========================================================================

    calculateMealPenalty(mealEntries, bedtime) {
        if (mealEntries.length === 0) return { penalty: 0 };
        
        const [bedHour, bedMin] = bedtime.split(':').map(Number);
        const bedtimeMinutes = bedHour * 60 + bedMin;
        
        let totalPenalty = 0;
        
        mealEntries.forEach(entry => {
            const [mealHour, mealMin] = entry.time.split(':').map(Number);
            let mealMinutes = mealHour * 60 + mealMin;
            
            let hoursBefore;
            if (mealMinutes > bedtimeMinutes) {
                hoursBefore = (bedtimeMinutes + 1440 - mealMinutes) / 60;
            } else {
                hoursBefore = (bedtimeMinutes - mealMinutes) / 60;
            }
            
            let penalty = 0;
            
            // Large meal within 3 hours
            if (entry.type === 'large' && hoursBefore < 3) {
                penalty += (3 - hoursBefore) * 8;
            }
            
            // High fat within 4 hours
            if (entry.macros === 'high-fat' && hoursBefore < 4) {
                penalty += (4 - hoursBefore) * 5;
            }
            
            // High protein within 2 hours (can disturb sleep)
            if (entry.macros === 'high-protein' && hoursBefore < 2) {
                penalty += 10;
            }
            
            totalPenalty += penalty;
        });
        
        return { penalty: totalPenalty };
    }

    // ========================================================================
    // ENVIRONMENT ENGINE
    // ========================================================================

    calculateEnvironmentScore(environment) {
        let bonus = 0;
        let penalties = 0;
        
        // Temperature scoring (optimal: 60-67°F)
        if (environment.temp >= 60 && environment.temp <= 67) {
            bonus += 5;
        } else if (environment.temp < 60) {
            penalties += (60 - environment.temp) * 2;
        } else if (environment.temp > 67) {
            penalties += (environment.temp - 67) * 2;
        }
        
        // Light scoring (optimal: < 50 lux)
        if (environment.light < 50) {
            bonus += 5;
        } else {
            penalties += (environment.light - 50) * 0.1;
        }
        
        // Noise scoring (optimal: < 30 dB)
        if (environment.noise < 30) {
            bonus += 5;
        } else {
            penalties += (environment.noise - 30) * 0.5;
        }
        
        // Bedroom only usage
        if (environment.bedroomOnly) {
            bonus += 5;
        }
        
        return { bonus, penalties };
    }

    // ========================================================================
    // RULE ENGINE
    // ========================================================================

    evaluateRules(entry) {
        const violations = [];
        
        // Sleep duration rule
        if (entry.sleepDuration < 420) { // Less than 7 hours
            violations.push(`CRITICAL: Sleep duration ${Math.floor(entry.sleepDuration/60)}h ${entry.sleepDuration%60}m is below minimum 7h`);
        }
        
        // Caffeine cutoff rule
        const caffeineResult = this.calculateCaffeinePenalty(entry.caffeine, entry.bedtime);
        if (caffeineResult.remaining > 50) {
            violations.push(`Caffeine remaining at bedtime: ${Math.round(caffeineResult.remaining)}mg (limit: 50mg)`);
        }
        
        // Alcohol rule
        const totalAlcohol = entry.alcohol.reduce((sum, a) => sum + a.units, 0);
        if (totalAlcohol > 2) {
            violations.push(`Alcohol consumption: ${totalAlcohol} units (limit: 2 units)`);
        }
        
        // Exercise timing rule
        entry.exercise.forEach(ex => {
            const [bedHour, bedMin] = entry.bedtime.split(':').map(Number);
            const [exHour, exMin] = ex.time.split(':').map(Number);
            
            let bedMinutes = bedHour * 60 + bedMin;
            let exMinutes = exHour * 60 + exMin;
            
            let hoursBefore = (bedMinutes - exMinutes) / 60;
            if (exMinutes > bedMinutes) {
                hoursBefore = (bedMinutes + 1440 - exMinutes) / 60;
            }
            
            if (ex.intensity === 'high' && hoursBefore < 3) {
                violations.push(`High intensity exercise within 3h of bedtime (${hoursBefore.toFixed(1)}h before)`);
            }
        });
        
        // Screen cutoff rule
        entry.screens.forEach(screen => {
            const [bedHour, bedMin] = entry.bedtime.split(':').map(Number);
            const [screenHour, screenMin] = screen.endTime.split(':').map(Number);
            
            let bedMinutes = bedHour * 60 + bedMin;
            let screenMinutes = screenHour * 60 + screenMin;
            
            let hoursBefore = (bedMinutes - screenMinutes) / 60;
            if (screenMinutes > bedMinutes) {
                hoursBefore = (bedMinutes + 1440 - screenMinutes) / 60;
            }
            
            if (hoursBefore < 1) {
                violations.push(`Screen time within 1h of bedtime (${(hoursBefore * 60).toFixed(0)}min before)`);
            }
        });
        
        // Circadian alignment
        const circadian = this.calculateCircadianAlignment(entry.bedtime, entry.waketime, entry.date);
        if (circadian.bedDeviation > 120) {
            violations.push(`Bedtime ${Math.round(circadian.bedDeviation)}min from optimal (limit: 120min)`);
        }
        
        return violations;
    }

    // ========================================================================
    // SCORING ENGINE
    // ========================================================================

    calculateQualityScore(entry) {
        let baseScore = 100;
        const breakdown = {};
        
        // Sleep duration penalty
        const duration = entry.sleepDuration;
        let durationPenalty = 0;
        
        if (duration < 420) { // Less than 7 hours
            durationPenalty = (420 - duration) / 60 * 15;
        } else if (duration > 540) { // More than 9 hours
            durationPenalty = (duration - 540) / 60 * 10;
        }
        
        breakdown.sleepDuration = {
            value: Math.floor(duration / 60) + 'h ' + (duration % 60) + 'm',
            penalty: -Math.round(durationPenalty)
        };
        
        // Sleep debt penalty
        const debtPenalty = (entry.sleepDebt / 60) * 5;
        breakdown.sleepDebt = {
            value: Math.floor(entry.sleepDebt / 60) + 'h ' + (entry.sleepDebt % 60) + 'm',
            penalty: -Math.round(debtPenalty)
        };
        
        // Circadian penalty
        const circadian = this.calculateCircadianAlignment(entry.bedtime, entry.waketime, entry.date);
        breakdown.circadian = {
            value: `Bed: ${Math.round(circadian.bedDeviation)}m, Wake: ${Math.round(circadian.wakeDeviation)}m`,
            penalty: -Math.round(circadian.penalty)
        };
        
        // Caffeine penalty
        const caffeineResult = this.calculateCaffeinePenalty(entry.caffeine, entry.bedtime);
        breakdown.caffeine = {
            value: `${Math.round(caffeineResult.remaining)}mg remaining`,
            penalty: -Math.round(caffeineResult.penalty)
        };
        
        // Alcohol penalty
        const alcoholResult = this.calculateAlcoholPenalty(entry.alcohol, entry.bedtime);
        breakdown.alcohol = {
            value: entry.alcohol.reduce((sum, a) => sum + a.units, 0) + ' units',
            penalty: -Math.round(alcoholResult.penalty)
        };
        
        // Exercise penalty
        const exerciseResult = this.calculateExercisePenalty(entry.exercise, entry.bedtime);
        breakdown.exercise = {
            value: entry.exercise.length + ' sessions',
            penalty: -Math.round(exerciseResult.penalty)
        };
        
        // Screen penalty
        const screenResult = this.calculateScreenPenalty(entry.screens, entry.bedtime);
        breakdown.screens = {
            value: entry.screens.length + ' sessions',
            penalty: -Math.round(screenResult.penalty)
        };
        
        // Meal penalty
        const mealResult = this.calculateMealPenalty(entry.meals, entry.bedtime);
        breakdown.meals = {
            value: entry.meals.length + ' meals',
            penalty: -Math.round(mealResult.penalty)
        };
        
        // Environment score
        const envResult = this.calculateEnvironmentScore(entry.environment);
        breakdown.environment = {
            value: `${entry.environment.temp}°F, ${entry.environment.light}lux, ${entry.environment.noise}dB`,
            penalty: Math.round(envResult.bonus - envResult.penalties)
        };
        
        // Calculate final score
        const totalPenalty = durationPenalty + debtPenalty + circadian.penalty + 
                           caffeineResult.penalty + alcoholResult.penalty + 
                           exerciseResult.penalty + screenResult.penalty + mealResult.penalty +
                           envResult.penalties;
        
        const finalScore = Math.max(0, Math.round(baseScore - totalPenalty + envResult.bonus));
        
        return { score: finalScore, breakdown };
    }

    // ========================================================================
    // UI MANAGEMENT - DYNAMIC ENTRIES
    // ========================================================================

    addCaffeineEntry() {
        const container = document.getElementById('caffeineEntries');
        const index = container.children.length;
        
        const row = document.createElement('div');
        row.className = 'entry-row';
        row.innerHTML = `
            <label>
                Time
                <input type="time" class="caffeine-time" required>
            </label>
            <label>
                Amount (mg)
                <input type="number" class="caffeine-mg" min="0" max="500" value="100" required>
            </label>
            <button type="button" class="btn-remove" onclick="this.parentElement.remove()">Remove</button>
        `;
        
        container.appendChild(row);
    }

    addAlcoholEntry() {
        const container = document.getElementById('alcoholEntries');
        
        const row = document.createElement('div');
        row.className = 'entry-row';
        row.innerHTML = `
            <label>
                Time
                <input type="time" class="alcohol-time" required>
            </label>
            <label>
                Units
                <input type="number" class="alcohol-units" min="0" max="20" step="0.5" value="1" required>
            </label>
            <button type="button" class="btn-remove" onclick="this.parentElement.remove()">Remove</button>
        `;
        
        container.appendChild(row);
    }

    addMealEntry() {
        const container = document.getElementById('mealEntries');
        
        const row = document.createElement('div');
        row.className = 'entry-row';
        row.innerHTML = `
            <label>
                Time
                <input type="time" class="meal-time" required>
            </label>
            <label>
                Size
                <select class="meal-type" required>
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                </select>
            </label>
            <label>
                Macros
                <select class="meal-macros" required>
                    <option value="balanced">Balanced</option>
                    <option value="high-carb">High Carb</option>
                    <option value="high-protein">High Protein</option>
                    <option value="high-fat">High Fat</option>
                </select>
            </label>
            <button type="button" class="btn-remove" onclick="this.parentElement.remove()">Remove</button>
        `;
        
        container.appendChild(row);
    }

    addExerciseEntry() {
        const container = document.getElementById('exerciseEntries');
        
        const row = document.createElement('div');
        row.className = 'entry-row';
        row.innerHTML = `
            <label>
                Time
                <input type="time" class="exercise-time" required>
            </label>
            <label>
                Type
                <select class="exercise-type" required>
                    <option value="strength">Strength</option>
                    <option value="cardio">Cardio</option>
                    <option value="flexibility">Flexibility</option>
                </select>
            </label>
            <label>
                Intensity
                <select class="exercise-intensity" required>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                </select>
            </label>
            <label>
                Duration (min)
                <input type="number" class="exercise-duration" min="5" max="300" value="30" required>
            </label>
            <button type="button" class="btn-remove" onclick="this.parentElement.remove()">Remove</button>
        `;
        
        container.appendChild(row);
    }

    addScreenEntry() {
        const container = document.getElementById('screenEntries');
        
        const row = document.createElement('div');
        row.className = 'entry-row';
        row.innerHTML = `
            <label>
                Start Time
                <input type="time" class="screen-start" required>
            </label>
            <label>
                End Time
                <input type="time" class="screen-end" required>
            </label>
            <label>
                Content Type
                <select class="screen-content" required>
                    <option value="passive">Passive (video)</option>
                    <option value="moderate">Moderate (browsing)</option>
                    <option value="active">Active (gaming, work)</option>
                </select>
            </label>
            <button type="button" class="btn-remove" onclick="this.parentElement.remove()">Remove</button>
        `;
        
        container.appendChild(row);
    }

    // ========================================================================
    // CALCULATION & SAVE
    // ========================================================================

    calculateAndSave() {
        // Collect all data
        const entry = this.getEmptyEntry();
        
        // Basic sleep data
        entry.date = document.getElementById('entryDate').value;
        entry.bedtime = document.getElementById('bedtime').value;
        entry.waketime = document.getElementById('waketime').value;
        
        if (!entry.date || !entry.bedtime || !entry.waketime) {
            alert('Please fill in date, bedtime, and wake time');
            return;
        }
        
        entry.sleepDuration = this.calculateSleepDuration(entry.bedtime, entry.waketime);
        entry.sleepDebt = this.calculateSleepDebt(entry.sleepDuration);
        
        // Caffeine
        document.querySelectorAll('#caffeineEntries .entry-row').forEach(row => {
            entry.caffeine.push({
                time: row.querySelector('.caffeine-time').value,
                mg: parseInt(row.querySelector('.caffeine-mg').value)
            });
        });
        
        // Alcohol
        document.querySelectorAll('#alcoholEntries .entry-row').forEach(row => {
            entry.alcohol.push({
                time: row.querySelector('.alcohol-time').value,
                units: parseFloat(row.querySelector('.alcohol-units').value)
            });
        });
        
        // Meals
        document.querySelectorAll('#mealEntries .entry-row').forEach(row => {
            entry.meals.push({
                time: row.querySelector('.meal-time').value,
                type: row.querySelector('.meal-type').value,
                macros: row.querySelector('.meal-macros').value
            });
        });
        
        // Exercise
        document.querySelectorAll('#exerciseEntries .entry-row').forEach(row => {
            entry.exercise.push({
                time: row.querySelector('.exercise-time').value,
                type: row.querySelector('.exercise-type').value,
                intensity: row.querySelector('.exercise-intensity').value,
                duration: parseInt(row.querySelector('.exercise-duration').value)
            });
        });
        
        // Screens
        document.querySelectorAll('#screenEntries .entry-row').forEach(row => {
            entry.screens.push({
                startTime: row.querySelector('.screen-start').value,
                endTime: row.querySelector('.screen-end').value,
                contentType: row.querySelector('.screen-content').value
            });
        });
        
        // Environment
        entry.environment = {
            temp: parseInt(document.getElementById('envTemp').value),
            light: parseInt(document.getElementById('envLight').value),
            noise: parseInt(document.getElementById('envNoise').value),
            bedroomOnly: document.getElementById('envBedroomOnly').checked
        };
        
        // Evaluate rules
        entry.violations = this.evaluateRules(entry);
        
        // Calculate quality score
        const scoreResult = this.calculateQualityScore(entry);
        entry.qualityScore = scoreResult.score;
        entry.breakdown = scoreResult.breakdown;
        
        // Save
        this.saveEntry(entry);
        
        // Display results
        this.displayResults(entry);
        
        // Update header
        this.updateHeaderStats();
        
        // Scroll to results
        document.getElementById('resultSection').scrollIntoView({ behavior: 'smooth' });
    }

    displayResults(entry) {
        const resultSection = document.getElementById('resultSection');
        resultSection.style.display = 'block';
        
        // Score
        document.getElementById('qualityScore').textContent = entry.qualityScore;
        
        // Violations
        const violationsDiv = document.getElementById('violations');
        if (entry.violations.length > 0) {
            violationsDiv.innerHTML = '<h3>Rule Violations</h3>' + 
                entry.violations.map(v => `<div class="violation-item">${v}</div>`).join('');
        } else {
            violationsDiv.innerHTML = '<h3 style="color: var(--success)">No Violations</h3>';
        }
        
        // Breakdown
        const breakdownDiv = document.getElementById('breakdown');
        breakdownDiv.innerHTML = Object.entries(entry.breakdown).map(([key, data]) => `
            <div class="breakdown-item">
                <h4>${key.replace(/([A-Z])/g, ' $1').trim()}</h4>
                <div class="value" style="color: ${data.penalty >= 0 ? 'var(--success)' : 'var(--danger)'}">
                    ${data.penalty >= 0 ? '+' : ''}${data.penalty}
                </div>
                <div class="detail">${data.value}</div>
            </div>
        `).join('');
    }

    loadEntry() {
        const date = document.getElementById('entryDate').value;
        if (!date) {
            alert('Please select a date');
            return;
        }
        
        const entry = this.getEntryByDate(date);
        if (!entry) {
            alert('No entry found for this date');
            return;
        }
        
        // Load basic data
        document.getElementById('bedtime').value = entry.bedtime;
        document.getElementById('waketime').value = entry.waketime;
        this.updateSleepInfo();
        
        // Load caffeine
        const caffeineContainer = document.getElementById('caffeineEntries');
        caffeineContainer.innerHTML = '';
        entry.caffeine.forEach(c => {
            this.addCaffeineEntry();
            const row = caffeineContainer.lastChild;
            row.querySelector('.caffeine-time').value = c.time;
            row.querySelector('.caffeine-mg').value = c.mg;
        });
        
        // Load alcohol
        const alcoholContainer = document.getElementById('alcoholEntries');
        alcoholContainer.innerHTML = '';
        entry.alcohol.forEach(a => {
            this.addAlcoholEntry();
            const row = alcoholContainer.lastChild;
            row.querySelector('.alcohol-time').value = a.time;
            row.querySelector('.alcohol-units').value = a.units;
        });
        
        // Load meals
        const mealContainer = document.getElementById('mealEntries');
        mealContainer.innerHTML = '';
        entry.meals.forEach(m => {
            this.addMealEntry();
            const row = mealContainer.lastChild;
            row.querySelector('.meal-time').value = m.time;
            row.querySelector('.meal-type').value = m.type;
            row.querySelector('.meal-macros').value = m.macros;
        });
        
        // Load exercise
        const exerciseContainer = document.getElementById('exerciseEntries');
        exerciseContainer.innerHTML = '';
        entry.exercise.forEach(e => {
            this.addExerciseEntry();
            const row = exerciseContainer.lastChild;
            row.querySelector('.exercise-time').value = e.time;
            row.querySelector('.exercise-type').value = e.type;
            row.querySelector('.exercise-intensity').value = e.intensity;
            row.querySelector('.exercise-duration').value = e.duration;
        });
        
        // Load screens
        const screenContainer = document.getElementById('screenEntries');
        screenContainer.innerHTML = '';
        entry.screens.forEach(s => {
            this.addScreenEntry();
            const row = screenContainer.lastChild;
            row.querySelector('.screen-start').value = s.startTime;
            row.querySelector('.screen-end').value = s.endTime;
            row.querySelector('.screen-content').value = s.contentType;
        });
        
        // Load environment
        document.getElementById('envTemp').value = entry.environment.temp;
        document.getElementById('envLight').value = entry.environment.light;
        document.getElementById('envNoise').value = entry.environment.noise;
        document.getElementById('envBedroomOnly').checked = entry.environment.bedroomOnly;
        
        // Display results
        this.displayResults(entry);
    }

    updateHeaderStats() {
        const data = this.getAllData();
        
        // Total debt
        const totalDebt = this.getCumulativeSleepDebt();
        const debtHours = Math.floor(totalDebt / 60);
        const debtMin = totalDebt % 60;
        document.getElementById('totalDebt').textContent = `${debtHours}h ${debtMin}m`;
        
        // Average quality
        if (data.length > 0) {
            const avgQuality = data.reduce((sum, e) => sum + e.qualityScore, 0) / data.length;
            document.getElementById('avgQuality').textContent = Math.round(avgQuality);
        }
        
        // Social jetlag
        const jetlag = this.calculateSocialJetlag();
        document.getElementById('socialJetlag').textContent = `${jetlag}m`;
    }

    // ========================================================================
    // WEEKLY REPORT
    // ========================================================================

    generateWeeklyReport() {
        const data = this.getAllData().slice(-7);
        
        if (data.length === 0) {
            document.getElementById('weeklyDebtTrend').textContent = 'No data';
            return;
        }
        
        // Sleep debt trend
        const debtTrend = data.reduce((sum, e) => sum + e.sleepDebt, 0);
        const avgDebt = debtTrend / data.length;
        document.getElementById('weeklyDebtTrend').textContent = `${Math.round(avgDebt)}m`;
        document.getElementById('weeklyDebtDetail').textContent = 
            debtTrend > 0 ? 'Accumulating deficit' : 'Well rested';
        
        // Social jetlag
        const jetlag = this.calculateSocialJetlag();
        document.getElementById('weeklySocialJetlag').textContent = `${jetlag}m`;
        document.getElementById('weeklySocialJetlagDetail').textContent = 
            jetlag > 90 ? 'High misalignment' : jetlag > 30 ? 'Moderate' : 'Good alignment';
        
        // Average quality
        const avgQuality = data.reduce((sum, e) => sum + e.qualityScore, 0) / data.length;
        document.getElementById('weeklyAvgQuality').textContent = Math.round(avgQuality);
        document.getElementById('weeklyQualityDetail').textContent = 
            avgQuality >= 80 ? 'Excellent' : avgQuality >= 60 ? 'Good' : avgQuality >= 40 ? 'Fair' : 'Poor';
        
        // Consistency
        const bedtimes = data.map(e => {
            const [h, m] = e.bedtime.split(':').map(Number);
            return h * 60 + m;
        });
        const avgBedtime = bedtimes.reduce((sum, t) => sum + t, 0) / bedtimes.length;
        const variance = bedtimes.reduce((sum, t) => sum + Math.pow(t - avgBedtime, 2), 0) / bedtimes.length;
        const stdDev = Math.sqrt(variance);
        const consistency = Math.max(0, 100 - stdDev);
        
        document.getElementById('weeklyConsistency').textContent = Math.round(consistency);
        document.getElementById('weeklyConsistencyDetail').textContent = 
            stdDev < 30 ? 'Very consistent' : stdDev < 60 ? 'Moderate' : 'Inconsistent';
        
        // Violation frequency
        const violationCount = {};
        data.forEach(e => {
            e.violations.forEach(v => {
                const key = v.split(':')[0];
                violationCount[key] = (violationCount[key] || 0) + 1;
            });
        });
        
        const violationsDiv = document.getElementById('weeklyViolations');
        if (Object.keys(violationCount).length > 0) {
            violationsDiv.innerHTML = Object.entries(violationCount)
                .sort((a, b) => b[1] - a[1])
                .map(([key, count]) => `
                    <div class="violation-freq-item">
                        <span>${key}</span>
                        <span>${count}x</span>
                    </div>
                `).join('');
        } else {
            violationsDiv.innerHTML = '<div style="color: var(--success)">No violations this week</div>';
        }
        
        // Adjustments
        const adjustmentsDiv = document.getElementById('weeklyAdjustments');
        const adjustments = [];
        
        if (debtTrend > 120) {
            adjustments.push({
                title: 'Sleep Debt Recovery',
                text: 'Extend sleep window by 30-60 minutes for next 3 nights. Target bedtime 30min earlier.'
            });
        }
        
        if (jetlag > 90) {
            adjustments.push({
                title: 'Social Jetlag Correction',
                text: 'Weekend wake time must not exceed weekday average + 60 minutes. Set alarm.'
            });
        }
        
        if (violationCount['Caffeine remaining at bedtime'] >= 3) {
            adjustments.push({
                title: 'Caffeine Cutoff Enforcement',
                text: 'No caffeine after 2:00 PM. Half-life model shows 100mg at 2PM = 25mg at 10PM.'
            });
        }
        
        if (violationCount['Screen time within 1h'] >= 4) {
            adjustments.push({
                title: 'Screen Curfew',
                text: 'Implement 2-hour screen cutoff. Use amber glasses if unavoidable. Blue light blocks melatonin.'
            });
        }
        
        if (avgQuality < 60) {
            adjustments.push({
                title: 'System Override',
                text: 'Quality below threshold. Enforce all hard rules for 7 days. No exceptions.'
            });
        }
        
        if (adjustments.length > 0) {
            adjustmentsDiv.innerHTML = adjustments.map(a => `
                <div class="adjustment-item">
                    <h4>${a.title}</h4>
                    <p>${a.text}</p>
                </div>
            `).join('');
        } else {
            adjustmentsDiv.innerHTML = '<div style="color: var(--success)">System operating within parameters</div>';
        }
    }

    // ========================================================================
    // DATA EXPORT
    // ========================================================================

    updateDataSummary() {
        const data = this.getAllData();
        const summary = {
            totalEntries: data.length,
            dateRange: data.length > 0 ? `${data[0].date} to ${data[data.length - 1].date}` : 'No data',
            avgQualityScore: data.length > 0 ? 
                Math.round(data.reduce((sum, e) => sum + e.qualityScore, 0) / data.length) : 0,
            totalSleepDebt: this.getCumulativeSleepDebt()
        };
        
        document.getElementById('dataSummary').textContent = JSON.stringify(summary, null, 2);
    }

    exportJSON() {
        const data = this.getAllData();
        const dataStr = JSON.stringify(data, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `sleep-system-data-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
    }

    exportWeeklyReport() {
        const data = this.getAllData().slice(-7);
        
        if (data.length === 0) {
            alert('No data to export');
            return;
        }
        
        let report = 'SLEEP SYSTEM - WEEKLY REPORT\n';
        report += '='.repeat(50) + '\n\n';
        report += `Generated: ${new Date().toISOString()}\n`;
        report += `Period: ${data[0].date} to ${data[data.length - 1].date}\n\n`;
        
        // Summary stats
        const avgQuality = data.reduce((sum, e) => sum + e.qualityScore, 0) / data.length;
        const totalDebt = data.reduce((sum, e) => sum + e.sleepDebt, 0);
        const jetlag = this.calculateSocialJetlag();
        
        report += 'SUMMARY\n';
        report += '-'.repeat(50) + '\n';
        report += `Average Quality Score: ${Math.round(avgQuality)}/100\n`;
        report += `Total Sleep Debt: ${Math.floor(totalDebt/60)}h ${totalDebt%60}m\n`;
        report += `Social Jetlag: ${jetlag} minutes\n\n`;
        
        // Daily entries
        report += 'DAILY ENTRIES\n';
        report += '-'.repeat(50) + '\n';
        data.forEach(entry => {
            report += `\nDate: ${entry.date}\n`;
            report += `  Sleep: ${entry.bedtime} - ${entry.waketime} (${Math.floor(entry.sleepDuration/60)}h ${entry.sleepDuration%60}m)\n`;
            report += `  Quality Score: ${entry.qualityScore}/100\n`;
            report += `  Sleep Debt: ${Math.floor(entry.sleepDebt/60)}h ${entry.sleepDebt%60}m\n`;
            
            if (entry.violations.length > 0) {
                report += `  Violations:\n`;
                entry.violations.forEach(v => report += `    - ${v}\n`);
            }
        });
        
        // Violation summary
        report += '\n\nVIOLATION FREQUENCY\n';
        report += '-'.repeat(50) + '\n';
        const violationCount = {};
        data.forEach(e => {
            e.violations.forEach(v => {
                const key = v.split(':')[0];
                violationCount[key] = (violationCount[key] || 0) + 1;
            });
        });
        
        if (Object.keys(violationCount).length > 0) {
            Object.entries(violationCount)
                .sort((a, b) => b[1] - a[1])
                .forEach(([key, count]) => {
                    report += `${key}: ${count}x\n`;
                });
        } else {
            report += 'No violations\n';
        }
        
        const blob = new Blob([report], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `sleep-system-weekly-report-${new Date().toISOString().split('T')[0]}.txt`;
        a.click();
        
        URL.revokeObjectURL(url);
    }

    resetSystem() {
        if (!confirm('Are you sure? This will delete ALL sleep data. This cannot be undone.')) {
            return;
        }
        
        if (!confirm('FINAL WARNING: All data will be permanently deleted.')) {
            return;
        }
        
        localStorage.removeItem('sleepSystemData');
        location.reload();
    }
}

// Initialize application
const app = new SleepSystem();
