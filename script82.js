angular
    .module('webApp')
    .controller('certificado04Controller', ['$scope', '$compile', '$location', '$uibModal', 'popupService', 'session', 'home', 'Vendedor',
        certificado04Controller]);

function certificado04Controller($scope, $compile, $location, $uibModal, popupService, session, home, Vendedor) {
    var vm = this;

    vm.certificado04 = '';
    vm.certificado08 = '';

	vm.cancelar = function () {
	    $location.path('/');
	}

	vm.siguiente = function () {
	    vm.formErrors = [];

	    if (vm.certificado04 === '') {
	        vm.formErrors.push('Debe ingresar el Número de Formulario 04');
	        return;
	    }

        $scope.$broadcast('show-errors-check-validity', 'form');
	    if (vm.form.$valid) {
	        var tramite = session.get(0);
            tramite.Certificado04 = vm.certificado04;
            session.set(0, tramite);

            modalInstance = $uibModal.open({
                animation: true,
                templateUrl: 'app/modules/vendedores/pregunta.html',
                controller: ['$scope', '$uibModalInstance', function ($scope, $uibModalInstance) {
                    $scope.Titulo = "Formulario 08";
                    $scope.Pregunta = "¿Ud posee un Formulario 08 con firma certificada?";

                    $scope.aceptar = function () {
                        $uibModalInstance.close(true);
                    }

                    $scope.close = function () {
                        $uibModalInstance.close(false);
                    }
                }],
                controllerAs: 'legalCtrl',
                backdrop: 'static',
                resolve: {
                }
            });

            modalInstance.result.then(function (rta) {
                if (rta)
                    $location.path('/certificado');
                else
                    $location.path("/titulares");
            }, function () {
            });
	    }
	}

	$scope.$on('validationInterceptor-detected', function (event, modelState) {
	    vm.formErrors = modelState[""];
	});
}