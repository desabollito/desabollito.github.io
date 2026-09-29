angular
    .module('webApp')
    .controller('certificadoController', ['$scope', '$compile', '$location', 'popupService', 'session', 'home', 'Vendedor',
				certificadoController]);

function certificadoController($scope, $compile, $location, popupService, session, home, Vendedor) {
    var vm = this;

    vm.certificado = '';

	vm.cancelar = function () {
	    $location.path('/');
	}

	vm.siguiente = function () {
	    vm.formErrors = [];

	    if (vm.certificado === '') {
	        vm.formErrors.push('Debe ingresar el Número de Formulario 08');
	        return;
	    }

	    $scope.$broadcast('show-errors-check-validity', 'form');
	    if (vm.form.$valid) {
	        var tramite = session.get(0);
	        tramite.Certificado = vm.certificado;
	    
	        session.set(0, tramite);

	        $location.path('/titulares');
	    }
	}

	$scope.$on('validationInterceptor-detected', function (event, modelState) {
	    vm.formErrors = modelState[""];
	});
}