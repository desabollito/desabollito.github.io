angular
    .module('webApp')
    .controller('estadoTramiteController', ['$scope', '$location', '$window', 'session', estadoTramiteController]);

function estadoTramiteController($scope, $location, $window, session) {
    $window.scrollTo(0, 0);
    var vm = this;
    setSubtitulo($scope, null);

    vm.solicitud = session.get(0);
    if (typeof (vm.solicitud) === "undefined") {
        $location.path('/');
        return;
    }

    vm.volver = function () {
        if (vm.solicitud.operacion === OperacionEnum.RetirarDocumentacion) {
            $location.path('/identificarTramite');
            return;
        }
        $location.path('/');
        return;
    };

    vm.submit = function () {
        vm.formErrors = [];
        $scope.$broadcast('show-errors-check-validity', 'form');
        if (vm.form.$valid) {
            if (vm.solicitud.operacion === OperacionEnum.RetirarDocumentacion) {
                //si es mandatario lo tomo como un solicitante
                if (vm.solicitud.cuitMandatario !== undefined) {
                    
                    vm.solicitud.mandatarioApellido = vm.solicitud.apellidoMandatario;
                    vm.solicitud.mandatarioCuit = vm.solicitud.cuitMandatario;
                    vm.solicitud.mandatarioNombre = vm.solicitud.mandatarioNombre;
                    vm.solicitud.mandatarioEmail = vm.solicitud.emailMandatario;
                    vm.solicitud.mandatarioMatricula = session.get(0).nroMatriculaMandatario;

                    vm.solicitud.esMandatario = true;
                    vm.solicitud.solicitante = null;
                    vm.solicitante = new Solicitante();
                    vm.solicitante.tipoDocumento = '8';
                    vm.solicitante.numeroDocumentoBuscado = vm.solicitud.cuitMandatario;
                    vm.solicitante.nombre = vm.solicitud.mandatarioNombre;
                    vm.solicitante.apellido = vm.solicitud.apellidoMandatario;
                    vm.solicitante.email = vm.solicitud.emailMandatario;
                    vm.solicitante.repitaEmail = vm.solicitud.emailMandatario;
                    vm.solicitante.celular = 'sd';
                    vm.solicitante.buscado = true;
                    vm.esValido = true;
                    vm.solicitud.emailValido = true;
                     
                    
                    $location.path('/seleccionarTurno');
                    return;
                }

                $location.path('/solicitante');
                return;
            }

            $location.path('/');
            return;
        }
    };

    registerInterceptorValidationSummary($scope, vm, $window);
}