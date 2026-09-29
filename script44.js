angular
    .module('webApp')
    .controller('shiftCalendarSiteController', ['$scope',
        function ($scope) {
            var vm = this;

            vm.afterRedraw = function () {
                var _onAvailableDayClick = function (evt) {
                    evt.stopImmediatePropagation();
                    var obj = this;
                    if ($(obj).is('td')) {
                        obj = $(obj).find('a')[0];
                    }
                    $(".selected-day").removeClass('selected-day');
                    $(obj).addClass('selected-day');
                    $scope.onavailabledayclick({ dia: $(obj).attr('shiftDate') });
                };
                $(".availableDay").click(_onAvailableDayClick);
            };

        }
    ])
    .directive('shiftCalendarSite', function () {
        return {
            restrict: "A",
            controller: 'shiftCalendarSiteController',
            controllerAs: 'shiftCalendarSiteCtrl',
            scope: {
                today: '@',
                start: '@',
                end: '@',
                diasnolaborables: '=',
                onavailabledayclick: "&"
            },
            link: function (scope, element, attrs, ctrl) {
                aShiftCalendar = new shiftCalendar(element[0], getDate(scope.start), getDates(scope.diasnolaborables), new Array(), getDate(scope.today), 0, getDate(scope.end));
                aShiftCalendar.afterRedraw = ctrl.afterRedraw;
                aShiftCalendar.refresh();
            }
        }
    });

//function getDateString(aDate) {
//    return (("00" + (aDate.getDate())).slice(-2)) + '/' + (("00" + (aDate.getMonth() + 1)).slice(-2)) + '/' + aDate.getFullYear();
//}

function getDate(fecha) {
    //fecha debe estar en dd/MM/yyyy
    return new Date(fecha.substr(6, 4), parseInt(fecha.substr(3, 2), 10) - 1, fecha.substr(0, 2), 0, 0, 0);
}

function getDates(fechas) {
    if (!fechas) return null;
    var ret = new Array();
    for (var i = 0; i < fechas.length; i++) {
        ret.push(getDate(fechas[i]).toGMTString());
    }
    return ret;
}