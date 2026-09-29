angular.module('dateTimePicker', []);

angular
	.module('dateTimePicker')
	.directive('datetimePicker', function () {
		return {
			restrict: "A",
			require: 'ngModel',
			link: function (scope, element, attrs, ctrl) {
				//Aplico el datetimepicker al elemento
				element.datetimepicker({ locale: 'es', format: 'DD/MM/YYYY' });
				//uso el evento de jquery del datetimepicker para actualizar el vm de angular
				element.on("dp.change", function (e) {
					scope.$apply(function () {
						ctrl.$setViewValue(element.val());	//Le asigno el valor del elemento actualizado por jquery al valor del viewmodel
					});
				});
			}
		}
	});