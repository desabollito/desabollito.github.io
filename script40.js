angular.module('cuitValidator', []);
//VER COMO EJECUTAR AL HACER 
//$scope.$broadcast('show-errors-check-validity', 'form');
//y no al tipear como esta ahora

angular
	.module('cuitValidator')
	.directive('cuit', function () {
		var validarCuil = function (cuil) {
			var mult = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
			var total = 0;
			var cuit = Array();

			cuil = cuil ? cuil.toString().replace(/-/g, "") : "";

			for (var x = 0; x < 11; x++) {
				if (cuil.substr(x, 1) !== "") {
					cuit[x] = cuil.substr(x, 1);
				}
			}

			if (cuit.length === 0)
				return true;

			if (cuit.length === 11) {
				var prim = cuit[0] + cuit[1];
                if (prim == 27 || prim == 20 || prim == 23 || prim == 30 || prim == 33 || prim == 24 || prim == 34) {
					for (var i = 0; i < mult.length; i++) {
						total += parseInt(cuit[i]) * mult[i];
					}
					var mod = total % 11;
					var digito = mod == 0 ? 0 : mod == 1 ? 9 : 11 - mod;
					if (digito == parseInt(cuit[10])) {
						return true;
					} else {
						return false;
					}
				} else {
					return false;
				}
			} else {
				return false;
			}
		}

		return {
		    require: 'ngModel',
		    scope: {
		        cuitvalidatordisabled: '='
		    },
			link: function (scope, element, attrs, ctrl) {
			    ctrl.$validators.cuit = function (modelValue, viewValue) {
			        if (scope.cuitvalidatordisabled) {
			            return true;
			        }
			        return validarCuil(modelValue);
				}
			}
		}
	});