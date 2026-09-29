var NUMBER_DAYS_IN_ADVANCE_RESTRICTION = 2;
var INITIAL_SELECTED_DATE = new Date(1975, 1, 1);

var dates = {
    convert: function (d) {
        // Converts the date in d to a date-object. The input can be:
        //   a date object: returned without modification
        //  an array      : Interpreted as [year,month,day]. NOTE: month is 0-11.
        //   a number     : Interpreted as number of milliseconds
        //                  since 1 Jan 1970 (a timestamp) 
        //   a string     : Any format supported by the javascript engine, like
        //        y          "YYYY/MM/DD", "MM/DD/YYYY", "Jan 31 2009" etc.
        //  an object     : Interpreted as an object with year, month and date
        //                  attributes.  **NOTE** month is 0-11.
        return (
            d.constructor === Date ? d :
            d.constructor === Array ? new Date(d[0], d[1], d[2]) :
            d.constructor === Number ? new Date(d) :
            d.constructor === String ? new Date(d) :
            typeof d === "object" ? new Date(d.year, d.month, d.date) :
            NaN
        );
    },
    compare: function (a, b) {
        // Compare two dates (could be of any type supported by the convert
        // function above) and returns:
        //  -1 : if a < b
        //   0 : if a = b
        //   1 : if a > b
        // NaN : if a or b is an illegal date
        // NOTE: The code inside isFinite does an assignment (=).
        return (
            isFinite(a = this.convert(a).valueOf()) &&
            isFinite(b = this.convert(b).valueOf()) ?
            (a > b) - (a < b) :
            NaN
        );
    },
    inRange: function (d, start, end) {
        // Checks if date in d is between dates in start and end.
        // Returns a boolean or NaN:
        //    true  : if d is between start and end (inclusive)
        //    false : if d is before start or after end
        //    NaN   : if one or more of the dates is illegal.
        // NOTE: The code inside isFinite does an assignment (=).
        return (
             isFinite(d = this.convert(d).valueOf()) &&
             isFinite(start = this.convert(start).valueOf()) &&
             isFinite(end = this.convert(end).valueOf()) ?
             start <= d && d <= end :
             NaN
         );
    }
}




function shiftCalendar(element, startDate, nonAvailableDays, bankHolidays, serverToday, workingDaysToPass, endDate) {
    this.setTimeInZero = function (aDate) {
        day = aDate.getDate();
        month = aDate.getMonth();
        year = aDate.getFullYear();
        return new Date(year, month, day, 0, 0, 0);
    };

    //If no parameter is passed use the current date. Also set the time in 0 to compare only de Date part.
    if (startDate == null)
        this.startDate = new Date();
    else
        this.startDate = this.setTimeInZero(startDate);

    this.fromDate = this.startDate;

    if (endDate == null)
        this.endDate = null;
    else
        this.endDate = this.setTimeInZero(endDate);

    if (serverToday == null)
        this.serverToday = new Date();
    else
        this.serverToday = this.setTimeInZero(serverToday);

    //Used to show different the day that the user has clicked.

    // Create Months and Days.
    this.months = new Array('ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE');
    this.nonAvailableDays = nonAvailableDays;
    this.bankHolidays = bankHolidays;
    this.workingDaysToPass = workingDaysToPass;

    window['aCalendar'] = this;


    //Methods
    this.refreshWith = function (aYear, aMonth, aDay) {
        this.startDate = new Date(aYear, aMonth, aDay, 0, 0, 0);
        this.refresh();
    };
    this.getFormatedDate = function (aDate, aFormat) {
        // C = Computer / YYYY/MM/DD 
        // Anything else DD/MM/YYYY
        if (aFormat == "YYYY/MM/DD" || aFormat == "C")
            return aDate.getFullYear() + '/' + (aDate.getMonth() + 1) + '/' + aDate.getDate();
        else
            return (("00" + (aDate.getDate())).slice(-2)) + '/' + (("00" + (aDate.getMonth() + 1)).slice(-2)) + '/' + aDate.getFullYear();
    };
    this.getNextDate = function (aDate) {
        nextDate = this.setTimeInZero(aDate);
        nextDate.setDate(1);
        nextDate.setMonth(aDate.getMonth() + 1);
        return nextDate;
    };
    this.getPreviousDate = function (aDate) {
        previousDate = this.setTimeInZero(aDate);
        previousDate.setDate(1);
        previousDate.setMonth(aDate.getMonth() - 1);
        return previousDate;
    };
    this.firstDayOfTheMonth = function (aDate) {
        day = aDate.getDate();
        month = aDate.getMonth();
        year = aDate.getFullYear();

        thisMonth = new Date(year, month, 1, 0, 0, 0);

        return thisMonth.getDay();
    };
    this.daysInMonth = function (iMonth, iYear) {
        return 32 - new Date(iYear, iMonth, 32).getDate();
    };
    this.getNextAvailableDate = function (serverToday, bankHolidays, workingDaysToPass) {
        var workingDaysPassed = 0;
        var hasToPassWorkingDay = (workingDaysPassed < workingDaysToPass);
        nextAvailableDate = null;
        newDate = this.setTimeInZero(serverToday);
        newDate.setDate(serverToday.getDate() + 1);
        while (nextAvailableDate == null) {
            var oldDate = newDate;
            if ((jQuery.inArray(newDate.toGMTString(), bankHolidays) > -1)
            || newDate.getDay() == 0 // Sunday
            || newDate.getDay() == 6) // Saturday
            {
                newDate.setDate(oldDate.getDate() + 1);
            }
            else if (hasToPassWorkingDay) {
                workingDaysPassed = workingDaysPassed + 1;
                hasToPassWorkingDay = workingDaysPassed < workingDaysToPass;
                newDate.setDate(oldDate.getDate() + 1);
            }
            else if (this.fromDate != undefined && this.fromDate > newDate) {
                newDate.setDate(oldDate.getDate() + 1);
            }
            else {
                nextAvailableDate = newDate;
            }
        }
        return nextAvailableDate;
    };
    this.isWeekend = function (aDate) {
        return (aDate.getDay() == 0) || (aDate.getDay() == 6);
    };
    this.refresh = function () {
        previousDate = this.getPreviousDate(this.startDate);
        nextDate = this.getNextDate(this.startDate);

        //Find out when this month starts and ends.
        firstWeekDay = this.firstDayOfTheMonth(this.startDate);
        daysInCurrentMonth = this.daysInMonth(this.startDate.getMonth(), this.startDate.getFullYear());

        calendarHtml = '<table>';
        calendarHtml += '<caption><a class="previous-month" onclick="aCalendar.refreshWith(' + previousDate.getFullYear() + ',' + previousDate.getMonth() + ',' + previousDate.getDate() + ')"></a><span>' + this.months[this.startDate.getMonth()] + ' ' + this.startDate.getFullYear() + '</span><a class="next-month" onclick="aCalendar.refreshWith(' + nextDate.getFullYear() + ',' + nextDate.getMonth() + ',' + nextDate.getDate() + ')"></a></caption>';
        calendarHtml += '<tr class="dia"><th>Do</th><th>Lu</th><th>Ma</th><th>Mi</th><th>Ju</th><th>Vi</th><th>Sa</th></tr>';
        calendarHtml += '<tr>';

        //Fill the first week of the month with the appropriate number of blanks.       
        for (weekDay = 0; weekDay < firstWeekDay; weekDay++) {
            calendarHtml += '<td class="not-working-day">&nbsp;</td>';
        }

        // It's use to create new rows in the calendar.
        weekDay = firstWeekDay;

        // Initialize date iterator
        dateIterator = this.setTimeInZero(this.startDate);
        nextAvailableDate = this.getNextAvailableDate(this.serverToday, this.bankHolidays, this.workingDaysToPass);

        for (currentMonthDay = 1; currentMonthDay <= daysInCurrentMonth; currentMonthDay++) {
            // Check if a new row is needed.
            if ((weekDay % 7) == 0)
                calendarHtml += '</tr><tr>';

            dateIterator.setDate(currentMonthDay);
            currentDate = new Date(this.startDate.getFullYear(), this.startDate.getMonth(), currentMonthDay, 0, 0, 0);

            //If current day is today =>
            if (dates.compare(currentDate, this.serverToday) == 0) {
                calendarHtml += '<td align="center" class="today"><b>' + currentMonthDay + '</b></td>';
            }
            else {
                //If current day is non possible day
                // - before today and 2 days in advance requisite
                // - bank holiday
                if ((dates.compare(currentDate, nextAvailableDate) == -1)
                || (jQuery.inArray(currentDate.toGMTString(), this.bankHolidays) > -1)
				|| (this.endDate != undefined && this.endDate != null && this.endDate < currentDate)
                || this.isWeekend(currentDate)) {
                    calendarHtml += '<td align="center" class="not-working-day">&nbsp;' + currentMonthDay + '&nbsp;</td>';
                }
                else {
                    if (jQuery.inArray(currentDate.toGMTString(), this.nonAvailableDays) > -1)
                        calendarHtml += '<td align="center" class="no-shift-available">&nbsp;' + currentMonthDay + '&nbsp;</td>';
                    else {
                        calendarHtml += '<td align="center" class="availableDay"><b>' +
                                            '<a shiftDate="' + this.getFormatedDate(currentDate, "DD/MM/YYYY") + '" class="availableDay" >' + currentMonthDay + '</a>' +
                                        '</b></td>';
                    }
                }
            }
            weekDay++;
        }
        //onmousedown="aCalendar.refreshSelectedWith(' + currentDate.getFullYear() + ',' + currentDate.getMonth() + ',' + currentDate.getDate() + ');" 
        //Check if empty cells are needed at the end.    
        if ((weekDay % 7) > 0) {
            for (currentMonthDay = (weekDay % 7) ; currentMonthDay < 7; currentMonthDay++) {
                calendarHtml += '<td class="not-working-day">&nbsp;</td>';
            }
        }

        calendarHtml += '</tr>';
        calendarHtml += '</table>';

        $(element).addClass('shiftCalendar').html(calendarHtml);

        if (this.afterRedraw) {
            this.afterRedraw();
        }
    };
}