angular
    .module('webApp')
    .controller('tableroController', ['$scope', '$location', '$window', '$uibModal', 'session', 'SITE', tableroController]);

function tableroController($scope, $location, $window, $uibModal, session, SITE) {
    var vm = this;

    var tramite = session.get(0);
    if (typeof (tramite) === "undefined") {
        $location.path('/');
        return;
    }

    vm.gestionarTurno = function () {

        var sesionMandatario = null;
        if (typeof (session.get(1)) !== "undefined") {
            sesionMandatario = angular.copy(session.get(1));
        }

        iniciarGestionarTurno($scope, session);
        //OBTENER TIPOS DE TRAMITE PARA TURNOS
        recaptchaCallback = function (token) {
            SITE.obtenerTiposTramitesParaTurnos(
                {
                    RecaptchaResponse: token,
                    EsMandatario: true
                },
                function (data) {
                    grecaptcha.reset();

                    vm.solicitud = session.get(0);
                    vm.solicitud.esMandatario = true;
                    vm.solicitud.emailValido = true;
                    vm.solicitud.tiposTramites = data.TiposTramites;

                    if (sesionMandatario) {
                        vm.solicitud.esMandatario = sesionMandatario.esMandatario;
                        vm.solicitud.mandatarioNombre = sesionMandatario.mandatarioNombre;
                        vm.solicitud.mandatarioApellido = sesionMandatario.mandatarioApellido;
                        vm.solicitud.mandatarioMatricula = sesionMandatario.mandatarioMatricula;
                        vm.solicitud.mandatarioTipoDocumento = sesionMandatario.mandatarioTipoDocumento;
                        vm.solicitud.mandatarioNumeroDocumento = sesionMandatario.mandatarioNumeroDocumento;
                        vm.solicitud.mandatarioCuit = sesionMandatario.mandatarioCuit;
                        vm.solicitud.mandatarioEmail = sesionMandatario.mandatarioEmail;
                    }

                    $location.path('/seleccionarTramite');
                    return;
                },
                function () {
                    grecaptcha.reset();
                });
        };
        grecaptcha.execute();
    };

    vm.iniciarInformeWeb = function () {
        var sesionMandatario = null;
        if (typeof (session.get(1)) !== "undefined") {
            sesionMandatario = angular.copy(session.get(1));
        }

        iniciarInformeWeb($scope, session);

        vm.solicitud = session.get(0);
        vm.solicitud.emailValido = true;

        if (sesionMandatario) {
            vm.solicitud.esMandatario = sesionMandatario.esMandatario;
            vm.solicitud.mandatarioNombre = sesionMandatario.mandatarioNombre;
            vm.solicitud.mandatarioApellido = sesionMandatario.mandatarioApellido;
            vm.solicitud.mandatarioMatricula = sesionMandatario.mandatarioMatricula;
            vm.solicitud.mandatarioTipoDocumento = sesionMandatario.mandatarioTipoDocumento;
            vm.solicitud.mandatarioNumeroDocumento = sesionMandatario.mandatarioNumeroDocumento;
            vm.solicitud.mandatarioCuit = sesionMandatario.mandatarioCuit;
            vm.solicitud.mandatarioEmail = sesionMandatario.mandatarioEmail;
        }

        $location.path('/solicitante');
    };

    vm.SeleccionarPartes = function () {
        if (session.len() <= 0)
            session.add(vm.Tramite);
        else {
            if (session.get(0).esMandatario) {
                vm.Tramite = session.get(0);
                vm.Tramite.AmbasPartes = true;
            }
            session.set(0, vm.Tramite);
        }

        $location.path("/vendedores");
    }

    vm.ReimprimirFormularios = function () {
        
        var data = {};
        data.NroPrecarga = vm.nroPrecarga;

        var tramite = session.get(0);

        modalInstance = $uibModal.open({
            animation: true,
            templateUrl: 'app/modules/mandatario/reimpresion.html',
            controller: ['$scope', '$uibModalInstance', 'session', 'Formulario08D', function ($modalscope, $uibModalInstance, session, Formulario08D) {
                var vmModal = this;


                Formulario08D.recuperar({ nroPrecarga: data.NroPrecarga, cuit: tramite.cuitMandatario }, function (data1) {
                    vmModal.Formularios = data1.Formularios;
                });

                vmModal.imprimirForm = function (key) {
                    var leftPosition = (screen.width) ? (screen.width - 1250) / 2 : 0;
                    var topPosition = (screen.height) ? (screen.height - 1250) / 2 : 0;

                    var settings = "toolbar=no,scrollbars=yes,location=no,statusbar=no,menubar=no,resizable=yes,width=1050px, height=900px,left=" + leftPosition + "px,innerLeft=" + leftPosition + "px,top=" + topPosition + "px,innerTop=" + topPosition + "px";
                    var url = "app/modules/escribania/impresionFormulario.html";

                    popUp = window.open(url, "_blank", settings);
                    popUp.DataToShare = vmModal.Formularios[key];
                    popUp.focus();
                }

                vmModal.terminar = function () {
                    $uibModalInstance.dismiss();
                }

                vmModal.close = function () {
                    $uibModalInstance.dismiss('cancel');
                }

                registerInterceptorValidationSummary($modalscope, vmModal);

            }],
            controllerAs: 'reimpresionCtrl',
            backdrop: 'static',
            resolve: {
                session: function () {
                    return session;
                }
            }
        });
        modalInstance.result.then(function (rta) {
            vm.nroPrecarga = "";
            $location.path("/escribanias/tablero");
        }, function () {

            $location.path("/");

        });
    }



    vm.retirarDocumentacion = function () {
        var cuitMandatario = session.get(0).cuitMandatario;
        var NombreM = session.get(0).nombreMandatario;
        var ApellidoM = session.get(0).apellidoMandatario;
        var EmailM = session.get(0).emailMandatario;
        var MatriculaM = session.get(0).nroMatriculaMandatario;

        iniciarRetirarDocumentacionMandatario($scope, session);
        session.get(0).esMandatario = true;
        session.get(0).mandatarioNombre = NombreM;
        session.get(0).cuitMandatario = cuitMandatario;
        session.get(0).apellidoMandatario = ApellidoM;
        session.get(0).emailMandatario = EmailM;
        session.get(0).nroMatriculaMandatario = MatriculaM;
        $location.path('/identificarTramite');
    };

    registerInterceptorValidationSummary($scope, vm, $window);

}